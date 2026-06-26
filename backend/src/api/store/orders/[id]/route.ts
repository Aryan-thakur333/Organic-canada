// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { enrichOrderFulfillmentTracking } from "../../../utils/fulfillment-tracking"

const DEFAULT_FIELDS = [
  "id",
  "status",
  "display_id",
  "created_at",
  "email",
  "currency_code",
  "total",
  "subtotal",
  "tax_total",
  "discount_total",
  "shipping_total",
  "payment_status",
  "fulfillment_status",
  "metadata",
  "items.*",
  "shipping_address.*",
  "billing_address.*",
  "fulfillments.id",
  "fulfillments.status",
  "fulfillments.created_at",
  "fulfillments.updated_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.metadata",
  "fulfillments.provider_id",
  "fulfillments.location_id",
]

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const query = req.scope.resolve("query")
    const { data } = await query.graph({
      entity: "order",
      fields: DEFAULT_FIELDS,
      filters: { id },
    })

    const order = data?.[0]
    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    return res.json({
      order: await enrichOrderFulfillmentTracking(req, order),
    })
  } catch (error: any) {
    console.error("Store order retrieve error:", error)
    return res.status(500).json({ message: error.message || "Failed to retrieve order" })
  }
}
