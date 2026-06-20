import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { posInstantFulfillmentWorkflow } from "../../../../workflows/pos-instant-fulfillment"

// ── Types ──────────────────────────────────────────────────────────────────

type PosQuickCheckoutItem = {
  variant_id: string
  quantity: number
}

type PosQuickCheckoutBody = {
  /** Array of variant IDs and quantities */
  items: PosQuickCheckoutItem[]
  /** "cash" or "card" */
  payment_method: "cash" | "card"
  /** Currency code (defaults to "eur") */
  currency_code?: string
  /** Optional customer email for the order */
  email?: string
  /** Optional region ID (uses first available region) */
  region_id?: string
  /** Optional sales channel ID (uses default) */
  sales_channel_id?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Computes the total for the given line items by looking up variant prices.
 */
async function computeLineItems(
  items: PosQuickCheckoutItem[],
  query: any,
  currency_code: string
): Promise<{
  lineItems: Array<{
    title: string
    quantity: number
    unit_price: number
    variant_id: string
    product_id: string
  }>
  total: number
}> {
  const variantIds = items.map((i) => i.variant_id)

  const { data: variants } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "title",
      "sku",
      "product.id",
      "product.title",
      "prices.id",
      "prices.amount",
      "prices.currency_code",
    ],
    filters: { id: variantIds },
  })

  const lineItems: any[] = []
  let total = 0

  for (const item of items) {
    const variant = variants?.find((v: any) => v.id === item.variant_id)
    if (!variant) {
      throw new Error(`Variant ${item.variant_id} not found`)
    }

    // Find the price matching the requested currency
    const prices = variant.prices || []
    const price = prices.find(
      (p: any) => p.currency_code === currency_code
    ) || prices[0]

    const unitPrice = price?.amount ?? 0
    const subtotal = unitPrice * item.quantity
    total += subtotal

    lineItems.push({
      title: variant.product?.title || variant.title || "POS Item",
      quantity: item.quantity,
      unit_price: unitPrice,
      variant_id: variant.id,
      product_id: variant.product?.id,
    })

    console.log(
      `[POS QuickCheckout] Item: ${variant.product?.title || variant.title} × ${item.quantity} @ ${unitPrice}${currency_code}`
    )
  }

  return { lineItems, total }
}

// ── POST ───────────────────────────────────────────────────────────────────

/**
 * POS Quick Checkout
 *
 * High-speed checkout for physical cash counters.
 * Bypasses the standard multi-step cart flow and directly creates a completed
 * order with instant fulfillment and payment capture.
 *
 * Request:
 * ```json
 * {
 *   "items": [{ "variant_id": "variant_01J...", "quantity": 2 }],
 *   "payment_method": "cash",
 *   "currency_code": "eur",
 *   "email": "customer@example.com"
 * }
 * ```
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = req.body as PosQuickCheckoutBody
  const { items, payment_method } = body

  // ── Validate input ───────────────────────────────────────────────────
  if (!items?.length) {
    return res.status(400).json({ message: "At least one item is required" })
  }

  if (!payment_method || !["cash", "card"].includes(payment_method)) {
    return res.status(400).json({ message: "payment_method must be 'cash' or 'card'" })
  }

  const currency_code = body.currency_code || "eur"
  const email = body.email || `pos-${Date.now()}@eatsie.local`

  // ── Resolve services ─────────────────────────────────────────────────
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const orderModuleService: any = req.scope.resolve(Modules.ORDER)
  const storeModuleService: any = req.scope.resolve(Modules.STORE)
  const salesChannelService: any = req.scope.resolve(Modules.SALES_CHANNEL)
  const link: any = req.scope.resolve(ContainerRegistrationKeys.REMOTE_LINK)

  try {
    // ── Resolve region ─────────────────────────────────────────────
    let regionId = body.region_id

    if (!regionId) {
      const { data: regions } = await query.graph({
        entity: "region",
        fields: ["id", "currency_code", "name"],
        filters: { currency_code },
        pagination: { take: 1 },
      })
      regionId = regions?.[0]?.id
    }

    if (!regionId) {
      // Fallback: pick any region
      const { data: regions } = await query.graph({
        entity: "region",
        fields: ["id", "currency_code", "name"],
        pagination: { take: 1 },
      })
      regionId = regions?.[0]?.id
    }

    if (!regionId) {
      return res.status(500).json({ message: "No region configured. Run seed script first." })
    }

    // ── Resolve sales channel ──────────────────────────────────────
    let salesChannelId = body.sales_channel_id

    if (!salesChannelId) {
      const channels = await salesChannelService.listSalesChannels(
        { name: "Default Sales Channel" },
        { take: 1 }
      )
      salesChannelId = channels?.[0]?.id

      if (!salesChannelId) {
        // Fallback: pick any
        const channels = await salesChannelService.listSalesChannels({}, { take: 1 })
        salesChannelId = channels?.[0]?.id
      }
    }

    // ── Compute line items with prices ─────────────────────────────
    const { lineItems, total } = await computeLineItems(items, query, currency_code)

    console.log(`[POS QuickCheckout] Total: ${total}${currency_code} for ${lineItems.length} item(s)`)

    // ── Find or create shipping/billing address ────────────────────
    // For POS, use a store-level default address
    const [store] = await storeModuleService.listStores()
    const defaultAddress = {
      first_name: "POS",
      last_name: "Customer",
      address_1: "Point of Sale",
      city: "Counter",
      country_code: "de",
      postal_code: "00000",
    }

    // ── Create the order directly (bypass cart) ────────────────────
    const newOrder = await orderModuleService.createOrders({
      email,
      currency_code,
      region_id: regionId,
      sales_channel_id: salesChannelId,
      shipping_address: defaultAddress,
      billing_address: defaultAddress,
      items: lineItems,
      metadata: {
        pos_origin: true,
        payment_method,
        pos_timestamp: new Date().toISOString(),
      },
    })

    console.log(`[POS QuickCheckout] Order created: ${newOrder.id}`)

    // ── Trigger instant fulfillment workflow ───────────────────────
    const { result: fulfillmentResult } = await posInstantFulfillmentWorkflow(req.scope).run({
      input: {
        order_id: newOrder.id,
        payment_method,
        items,
        currency_code,
      },
    })

    console.log(
      `[POS QuickCheckout] Fulfillment complete for ${newOrder.id}:`,
      fulfillmentResult
    )

    return res.status(201).json({
      success: true,
      order_id: newOrder.id,
      total,
      currency_code,
      payment_method,
      item_count: lineItems.length,
      fulfillment: fulfillmentResult,
    })
  } catch (error: any) {
    console.error("[POS QuickCheckout] Error:", error.message)
    return res.status(500).json({
      message: error.message || "POS checkout failed",
    })
  }
}
