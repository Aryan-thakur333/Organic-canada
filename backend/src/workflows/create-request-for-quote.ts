import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import {
  beginOrderEditOrderWorkflow,
  createOrderWorkflow,
} from "@medusajs/medusa/core-flows"
import { B2B_MODULE } from "../modules/b2b/index"

export enum QuoteStatus {
  PENDING_MERCHANT = "pending_merchant",
  PENDING_CUSTOMER = "pending_customer",
  ACCEPTED = "accepted",
  CUSTOMER_REJECTED = "customer_rejected",
  MERCHANT_REJECTED = "merchant_rejected",
}

export type CreateRequestForQuoteInput = {
  cart_id: string
  customer_id: string
  company_id?: string
  note?: string
}

type PreparedQuoteRequest = {
  cart: Record<string, any>
  customer: Record<string, any>
  company: Record<string, any>
  requested_items: Record<string, any>[]
  requested_total: number
  create_order_input: Record<string, any>
  quote_seed: Record<string, any>
}

const prepareRequestForQuoteStep = createStep(
  "prepare-request-for-quote",
  async (input: CreateRequestForQuoteInput, { container }) => {
    const query: any = container.resolve("query")
    const customerModule: any = container.resolve(Modules.CUSTOMER)

    const { data: carts } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "email",
        "customer_id",
        "region_id",
        "currency_code",
        "sales_channel_id",
        "shipping_address.*",
        "billing_address.*",
        "items.id",
        "items.title",
        "items.subtitle",
        "items.thumbnail",
        "items.variant_id",
        "items.product_id",
        "items.product_title",
        "items.variant_title",
        "items.variant_sku",
        "items.quantity",
        "items.unit_price",
        "items.total",
        "items.subtotal",
        "items.metadata",
        "subtotal",
        "total",
      ],
      filters: { id: input.cart_id },
    })

    const cart = carts?.[0]
    if (!cart) {
      const error: any = new Error("Cart not found")
      error.status = 404
      throw error
    }

    if (cart.customer_id !== input.customer_id) {
      const error: any = new Error("Cart does not belong to the authenticated customer")
      error.status = 403
      throw error
    }

    const items = Array.isArray(cart.items) ? cart.items : []
    if (!items.length) {
      const error: any = new Error("Cart must contain at least one item before requesting a quote")
      error.status = 400
      throw error
    }

    const customer = await customerModule.retrieveCustomer(input.customer_id)
    if (!customer) {
      const error: any = new Error("Customer not found")
      error.status = 404
      throw error
    }

    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["company.id", "company.company_name", "company.status"],
      filters: { id: input.customer_id },
    })

    const linkedCompany = customers?.[0]?.company
    const company = input.company_id
      ? linkedCompany?.id === input.company_id
        ? linkedCompany
        : null
      : linkedCompany

    if (!company) {
      const error: any = new Error("No B2B company is linked to this customer")
      error.status = 403
      throw error
    }

    if (company.status !== "approved" && company.status !== "active") {
      const error: any = new Error(`Your company is ${company.status}. Only approved companies can request quotes.`)
      error.status = 403
      throw error
    }

    const requestedItems = items.map((item: any) => {
      const unitPrice = Number(item.unit_price || 0)
      const quantity = Number(item.quantity || 0)

      return {
        product_id: item.product_id || null,
        variant_id: item.variant_id || null,
        title: item.product_title || item.title || item.variant_title || "Cart item",
        sku: item.variant_sku || null,
        quantity,
        requested_unit_price: unitPrice,
        current_calculated_unit_price: unitPrice,
        line_total: Number(item.total ?? item.subtotal ?? unitPrice * quantity),
        note: null,
      }
    })

    const requestedTotal = Number(cart.total ?? cart.subtotal ?? requestedItems.reduce(
      (sum: number, item: any) => sum + Number(item.line_total || 0),
      0
    ))

    const createOrderInput = {
      status: "draft",
      is_draft_order: true,
      region_id: cart.region_id,
      customer_id: input.customer_id,
      email: cart.email || customer.email,
      currency_code: (cart.currency_code || "cad").toLowerCase(),
      sales_channel_id: cart.sales_channel_id,
      shipping_address: cart.shipping_address || undefined,
      billing_address: cart.billing_address || cart.shipping_address || undefined,
      items: items.map((item: any) => ({
        title: item.title || item.product_title || "Cart item",
        subtitle: item.subtitle || item.variant_title || undefined,
        thumbnail: item.thumbnail || undefined,
        variant_id: item.variant_id || undefined,
        product_id: item.product_id || undefined,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        metadata: {
          ...(item.metadata || {}),
          quote_cart_id: cart.id,
        },
      })),
      metadata: {
        quote_cart_id: cart.id,
        quote_customer_id: input.customer_id,
        quote_company_id: company.id,
        is_b2b_quote_draft: true,
      },
    }

    return new StepResponse<PreparedQuoteRequest>({
      cart,
      customer,
      company,
      requested_items: requestedItems,
      requested_total: requestedTotal,
      create_order_input: createOrderInput,
      quote_seed: {
        company_id: company.id,
        customer_id: input.customer_id,
        customer_email: customer.email || cart.email || "",
        customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
        company_name: company.company_name || null,
        currency_code: (cart.currency_code || "cad").toLowerCase(),
        buyer_note: input.note || null,
        customer_note: input.note || null,
        cart_id: cart.id,
        created_cart_id: cart.id,
        requested_by: input.customer_id,
        requested_items: requestedItems,
        items: requestedItems,
        requested_total: requestedTotal,
        subtotal: requestedTotal,
        total: requestedTotal,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        metadata: {
          submitted_by: input.customer_id,
          submitted_at: new Date().toISOString(),
          source: "cart",
          cart_id: cart.id,
        },
      },
    })
  }
)

const createQuoteRecordStep = createStep(
  "create-b2b-quote-record",
  async (
    input: {
      quote_seed: Record<string, any>
      draft_order: Record<string, any>
      order_change: Record<string, any>
    },
    { container }
  ) => {
    const b2bService: any = container.resolve(B2B_MODULE)
    const orderChangeId =
      input.order_change?.id ||
      input.order_change?.order_change_id ||
      input.order_change?.order_change?.id ||
      null

    const quote = await b2bService.createQuotes({
      ...input.quote_seed,
      status: QuoteStatus.PENDING_MERCHANT,
      draft_order_id: input.draft_order.id,
      order_change_id: orderChangeId,
      metadata: {
        ...(input.quote_seed.metadata || {}),
        draft_order_id: input.draft_order.id,
        order_change_id: orderChangeId,
      },
    })

    return new StepResponse(quote, { quote_id: quote.id })
  },
  async (compensationData: { quote_id: string } | undefined, { container }) => {
    if (!compensationData?.quote_id) {
      return
    }

    const b2bService: any = container.resolve(B2B_MODULE)
    await b2bService.deleteQuotes(compensationData.quote_id)
  }
)

export const createRequestForQuoteWorkflow = createWorkflow(
  "create-request-for-quote",
  (input: CreateRequestForQuoteInput) => {
    const prepared = prepareRequestForQuoteStep(input)

    const draftOrder = createOrderWorkflow.runAsStep({
      input: prepared.create_order_input as any,
    })

    const orderChange = beginOrderEditOrderWorkflow.runAsStep({
      input: transform({ draftOrder, input }, ({ draftOrder, input }) => ({
        order_id: draftOrder.id,
        created_by: input.customer_id,
        description: "B2B quote request",
        internal_note: "Created automatically for a B2B customer quote request.",
      })),
    })

    const quote = createQuoteRecordStep({
      quote_seed: prepared.quote_seed,
      draft_order: draftOrder as any,
      order_change: orderChange as any,
    })

    return new WorkflowResponse(quote)
  }
)
