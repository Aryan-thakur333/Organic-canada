// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { asArray, getVendorProductIdSets } from "../../../_ownership"

async function getVendorOrderAccess(req: MedusaRequest, orderId: string) {
  const vendor = (req as any).vendor
  const query = req.scope.resolve("query")

  const { productIds, variantIds } = await getVendorProductIdSets(query, vendor.id)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "fulfillment_status",
      "metadata",
      "items.id",
      "items.product_id",
      "items.variant_id",
      "items.title",
      "items.quantity",
      "items.unit_price",
    ],
    filters: { id: orderId },
  })

  const order = orders?.[0]
  if (!order) return { accessible: false, reason: "Order not found" }

  const vendorItems = asArray(order.items).filter(
    (item: any) =>
      (item.variant_id && variantIds.has(item.variant_id)) ||
      (item.product_id && productIds.has(item.product_id))
  )

  if (!vendorItems.length) return { accessible: false, reason: "No vendor items in this order" }

  return { accessible: true, order, vendorItems, vendor }
}

/**
 * POST /vendor/orders/action/:id
 * 
 * Accept, reject, or mark an order as fulfilled from a vendor's perspective.
 * Vendor actions are stored in order metadata so they don't conflict with
 * Medusa's native order/fulfillment workflow.
 *
 * Body: { action: "accept" | "reject" | "fulfill", reason?: string }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { action, reason } = req.body as any

  const validActions = ["accept", "reject", "fulfill"]
  if (!validActions.includes(action)) {
    return res.status(400).json({ message: `Action must be one of: ${validActions.join(", ")}` })
  }

  try {
    const access = await getVendorOrderAccess(req, id)
    if (!access.accessible) {
      return res.status(404).json({ message: access.reason })
    }

    const orderService: any = req.scope.resolve(Modules.ORDER)
    const existingOrder = access.order
    const vendorId = access.vendor.id

    // Build vendor action history in order metadata
    const vendorActions = existingOrder.metadata?.vendor_actions || {}
    const existingAction = vendorActions[vendorId]

    // Prevent re-actions
    if (existingAction && existingAction.action !== "pending") {
      return res.status(409).json({
        message: `This order was already ${existingAction.action}ed. Current status: ${existingAction.action}`,
        currentAction: existingAction,
      })
    }

    // Default vendor action state
    if (!existingAction) {
      vendorActions[vendorId] = { action: "pending", updated_at: existingOrder.created_at }
    }

    // Update vendor action
    vendorActions[vendorId] = {
      action,
      reason: reason || null,
      updated_at: new Date().toISOString(),
    }

    // If fulfilling, also create fulfillment entries
    let fulfillmentEntries = existingOrder.metadata?.vendor_fulfillments || {}
    if (action === "fulfill") {
      fulfillmentEntries[vendorId] = {
        fulfilled_at: new Date().toISOString(),
        items: access.vendorItems.map((item: any) => ({
          item_id: item.id,
          product_id: item.product_id,
          title: item.title,
          quantity: item.quantity,
        })),
      }
    }

    await orderService.updateOrders({
      id,
      metadata: {
        ...(existingOrder.metadata || {}),
        vendor_actions: vendorActions,
        vendor_fulfillments: fulfillmentEntries,
        ...(action === "fulfill"
          ? { vendor_fulfillment_status: "fulfilled" }
          : action === "reject"
          ? { vendor_fulfillment_status: "rejected" }
          : { vendor_fulfillment_status: "accepted" }),
      },
    })

    return res.json({
      message: `Order ${action}ed successfully`,
      action: vendorActions[vendorId],
      vendor_fulfillment_status: action === "fulfill" ? "fulfilled" : action === "reject" ? "rejected" : "accepted",
    })
  } catch (error: any) {
    console.error("Vendor order action error:", error)
    return res.status(500).json({ message: error.message || "Failed to process order action" })
  }
}

/**
 * GET /vendor/orders/action/:id
 * Get the current vendor action status for an order.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const access = await getVendorOrderAccess(req, id)
    if (!access.accessible) {
      return res.status(404).json({ message: access.reason })
    }

    const vendorId = access.vendor.id
    const vendorActions = access.order.metadata?.vendor_actions || {}
    const vendorFulfillments = access.order.metadata?.vendor_fulfillments || {}

    return res.json({
      order_id: id,
      vendor_action: vendorActions[vendorId] || { action: "pending", updated_at: null },
      vendor_fulfillment: vendorFulfillments[vendorId] || null,
      vendor_fulfillment_status: access.order.metadata?.vendor_fulfillment_status || "pending",
      order_status: access.order.status,
      fulfillment_status: access.order.fulfillment_status,
    })
  } catch (error: any) {
    console.error("Vendor order action status error:", error)
    return res.status(500).json({ message: error.message || "Failed to get order action status" })
  }
}
