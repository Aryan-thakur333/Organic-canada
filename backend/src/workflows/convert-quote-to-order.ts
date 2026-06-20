import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../modules/b2b"

// ── Types ──────────────────────────────────────────────────────────────────

export type ConvertQuoteToOrderInput = {
  quote_id: string
  company_id: string
  customer_id: string
  customer_email: string
  /** JSON array of quote line items */
  items: QuoteItem[]
  /** Total amount in cents (subtotal or negotiated override) */
  total: number
  admin_notes: string | null
}

export type QuoteItem = {
  product_id?: string
  variant_id?: string
  title: string
  sku?: string
  quantity: number
  unit_price: number
  total: number
}

export type ConvertQuoteToOrderOutput = {
  quote_id: string
  order_id: string
  order: Record<string, any>
  company_id: string
}

// ── Step 1: Validate quote and mark as 'converted' ─────────────────────────

const validateAndMarkQuoteStep = createStep(
  "validate-and-mark-quote",

  async ({ quote_id }: { quote_id: string }, { container }) => {
    const b2bService: any = container.resolve(B2B_MODULE)

    const quote = await b2bService.retrieveQuote(quote_id)
    if (!quote) {
      throw new Error(`Quote "${quote_id}" not found`)
    }
    if (quote.status !== "approved") {
      throw new Error(
        `Quote "${quote_id}" has status "${quote.status}". Only 'approved' quotes can be converted.`
      )
    }

    // Mark as converting to prevent double conversion
    await b2bService.updateQuotes({ id: quote_id, status: "converted" })

    return new StepResponse(
      { quote },
      { quote_id, previous_status: quote.status }
    )
  },

  // Compensate: revert quote back to 'approved' if order creation fails
  async (
    { quote_id, previous_status }: { quote_id: string; previous_status: string },
    { container }
  ) => {
    const b2bService: any = container.resolve(B2B_MODULE)
    await b2bService.updateQuotes({
      id: quote_id,
      status: previous_status,
    })
  }
)

// ── Step 2: Create the Medusa order from quote items ──────────────────────

const createOrderFromQuoteStep = createStep(
  "create-order-from-quote",

  async (
    input: ConvertQuoteToOrderInput,
    { container }
  ) => {
    const orderModuleService: any = container.resolve(Modules.ORDER)
    const customerModuleService: any = container.resolve(Modules.CUSTOMER)
    const remoteLink: any = container.resolve("remoteLink")

    // ── 2a. Resolve the customer to get their default region / addresses ─
    let regionId: string | undefined
    let shippingAddress: Record<string, any> | undefined
    let billingAddress: Record<string, any> | undefined

    try {
      const customer = await customerModuleService.retrieveCustomer(input.customer_id)
      if (customer?.metadata?.region_id) {
        regionId = customer.metadata.region_id as string
      }
    } catch {
      // Customer lookup is best-effort — order creation can proceed
      // without region info (the admin can assign it later).
    }

    // ── 2b. Build order items from quote line items ─────────────────────
    const orderItems = (input.items || []).map((item: QuoteItem) => ({
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      variant_id: item.variant_id || undefined,
      product_id: item.product_id || undefined,
      metadata: {
        quote_id: input.quote_id,
        is_wholesale: true,
        sku: item.sku || null,
      },
    }))

    // ── 2c. Create the order in Medusa core ──────────────────────────────
    const newOrder = await orderModuleService.createOrders({
      email: input.customer_email,
      currency_code: "usd",
      region_id: regionId,
      shipping_address: shippingAddress,
      billing_address: billingAddress,
      items: orderItems,
      metadata: {
        quote_id: input.quote_id,
        company_id: input.company_id,
        is_wholesale: true,
        admin_notes: input.admin_notes,
        converted_from_quote: true,
      },
    })

    // ── 2d. Link the order to the company for graph traversal ────────────
    //      This enables Remote Query lookups like:
    //      query.graph({ entity: "order", fields: ["company.*"] })
    try {
      await remoteLink.create({
        [Modules.ORDER]: { order_id: newOrder.id },
        [B2B_MODULE]: { company_id: input.company_id },
      })
    } catch (linkErr: any) {
      // Non-fatal — the order exists and the quote is converted.
      // Link failure means the order won't show under the company graph,
      // but the metadata reference is still present.
      console.warn(
        `[ConvertQuoteToOrder] Failed to link order ${newOrder.id} to company ${input.company_id}: ${linkErr.message}`
      )
    }

    const output: ConvertQuoteToOrderOutput = {
      quote_id: input.quote_id,
      order_id: newOrder.id,
      order: newOrder,
      company_id: input.company_id,
    }

    return new StepResponse(output, {
      order_id: newOrder.id,
      quote_id: input.quote_id,
    })
  },

  // Compensate: cancel the created order if a downstream step fails
  async (
    compData: { order_id: string; quote_id: string } | undefined,
    { container }
  ) => {
    if (!compData?.order_id) return
    try {
      const orderModuleService: any = container.resolve(Modules.ORDER)
      await orderModuleService.cancelOrder(compData.order_id)
      console.log(
        `[ConvertQuoteToOrder][Compensate] Cancelled order ${compData.order_id} for quote ${compData.quote_id}`
      )
    } catch {
      // Order may have already been cleaned up
    }
  }
)

// ── Workflow ───────────────────────────────────────────────────────────────

/**
 * Convert Quote to Order Workflow
 *
 * Takes an admin-approved B2B wholesale quote and:
 * 1. Validates the quote is in 'approved' status, then marks it 'converted'
 * 2. Creates a Medusa Order from the quote line items
 * 3. Links the order to the company's corporate checkout profile
 * 4. Returns the order details for the admin dashboard
 *
 * Fully compensatable — if order creation fails, the quote is reverted
 * back to 'approved' so the admin can retry.
 *
 * Usage:
 * ```ts
 * const { result } = await convertQuoteToOrderWorkflow(container).run({
 *   input: {
 *     quote_id: "b2bq_01J...",
 *     company_id: "company_01J...",
 *     customer_id: "cus_01J...",
 *     customer_email: "admin@acme.com",
 *     items: [...],
 *     total: 50000,
 *     admin_notes: "Approved by John (VP Sales)",
 *   }
 * })
 * console.log(result.order_id)
 * ```
 */
export const convertQuoteToOrderWorkflow = createWorkflow(
  "convert-quote-to-order",

  (input: ConvertQuoteToOrderInput) => {
    // Step 1: Validate the quote and mark as 'converted'
    validateAndMarkQuoteStep({ quote_id: input.quote_id })

    // Step 2: Create the Medusa order from quote items
    const result = createOrderFromQuoteStep(input)

    return new WorkflowResponse(result)
  }
)
