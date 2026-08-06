import { Modules } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../modules/marketplace/index"

export async function resolveVendorFulfillment(container: any, vendorOrderId: string) {
  const marketplaceService = container.resolve(MARKETPLACE_MODULE)
  const query = container.resolve("query")

  const vendorOrder = await marketplaceService.retrieveVendorOrder(vendorOrderId, {
    relations: ["items"]
  })

  const parentOrderId = vendorOrder.order_id
  const vendorId = vendorOrder.vendor_id

  // Fetch parent order with fulfillments
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "fulfillment_status",
      "items.id",
      "items.quantity",
      "fulfillments.id",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.tracking_number",
      "fulfillments.metadata",
      "fulfillments.items.id",
      "fulfillments.items.line_item_id",
      "fulfillments.items.quantity"
    ],
    filters: { id: parentOrderId }
  })

  const parentOrder = orders?.[0]
  if (!parentOrder) {
    throw new Error(`Parent order not found: ${parentOrderId}`)
  }

  // Get vendor-owned parent order line items
  const vendorLineItemIds = new Set(vendorOrder.items.map((i: any) => i.line_item_id || i.order_item_id))

  let matchedFulfillment: any = null

  // 1. Prefer metadata.fulfillment_id
  const metadataFulfillmentId = vendorOrder.metadata?.fulfillment_id
  const fulfillments = parentOrder.fulfillments || []

  if (metadataFulfillmentId) {
    matchedFulfillment = fulfillments.find((f: any) => f.id === metadataFulfillmentId)
  }

  // 2. If not matched, search fulfillments by items
  if (!matchedFulfillment) {
    for (const f of fulfillments) {
      const fItems = f.items || []
      const hasVendorItem = fItems.some((fi: any) => vendorLineItemIds.has(fi.line_item_id))
      if (hasVendorItem) {
        matchedFulfillment = f
        break
      }
    }
  }

  const is_fulfilled = !!matchedFulfillment
  const is_shipped = matchedFulfillment ? !!matchedFulfillment.shipped_at : false
  const is_delivered = matchedFulfillment ? !!matchedFulfillment.delivered_at : false

  // tracking details
  const tracking = matchedFulfillment ? {
    carrier: matchedFulfillment.metadata?.carrier || null,
    service: matchedFulfillment.metadata?.service || null,
    tracking_number: matchedFulfillment.tracking_number || matchedFulfillment.metadata?.tracking_number || null,
    tracking_url: matchedFulfillment.tracking_url || matchedFulfillment.metadata?.tracking_url || null
  } : null

  return {
    fulfillment: matchedFulfillment,
    fulfillment_id: matchedFulfillment?.id || null,
    vendor_order_items: vendorOrder.items,
    native_order_item_ids: Array.from(vendorLineItemIds),
    is_fulfilled,
    is_shipped,
    is_delivered,
    tracking
  }
}
