import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import { validateVendorOrderTransition } from "../../../../../utils/marketplace/vendor-order-state"
import { recalculateParentOrderStatus } from "../../../../../utils/marketplace/recalculate-parent-order-status"
import { Modules } from "@medusajs/framework/utils"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const vendorOrderId = req.params.id
  const marketplaceService: any = req.scope.resolve(MARKETPLACE_MODULE)
  const container = req.scope

  try {
    const vendorOrder = await marketplaceService.retrieveVendorOrder(vendorOrderId, {
      relations: ["items"]
    })
    
    if (vendorOrder.vendor_id !== vendor.id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    if (vendorOrder.status === "accepted") {
      return res.json({ success: true, message: "Order is already accepted", order: vendorOrder })
    }

    // Verify parent order and vendor items
    const query = req.scope.resolve("query")
    const { data: parentOrders } = await query.graph({
      entity: "order",
      fields: ["id", "items.id"],
      filters: { id: vendorOrder.order_id }
    })
    const parentOrder = parentOrders?.[0]
    if (!parentOrder) {
      return res.status(404).json({ message: "Parent order not found" })
    }

    if (!vendorOrder.items || vendorOrder.items.length === 0) {
      return res.status(422).json({ message: "Vendor order items not found" })
    }

    validateVendorOrderTransition(vendorOrder.status, "accepted")

    await marketplaceService.updateVendorOrders({
      id: vendorOrderId,
      status: "accepted",
      accepted_at: new Date().toISOString()
    })

    await marketplaceService.createVendorOrderActivities({
      vendor_order_id: vendorOrderId,
      vendor_id: vendor.id,
      type: "order_accepted",
      title: "Order accepted",
      actor_type: "vendor",
      actor_id: vendor.id
    })

    // Sync parent order state
    await recalculateParentOrderStatus(container, vendorOrder.order_id)

    // Emit vendor-order.accepted event
    try {
      const eventBus: any = container.resolve(Modules.EVENT_BUS)
      await eventBus.emit({
        name: "vendor-order.accepted",
        data: {
          id: vendorOrderId,
          vendor_id: vendor.id,
          order_id: vendorOrder.order_id,
        },
      })
    } catch (err: any) {
      console.warn("[VENDOR_ORDERS_EVENT_EMIT_FAILED]", err?.message || err)
    }

    const updated = await marketplaceService.retrieveVendorOrder(vendorOrderId)

    return res.json({ success: true, message: "Order accepted", order: updated })
  } catch (error: any) {
    if (error.message?.includes("Invalid state transition")) {
      return res.status(409).json({ message: error.message })
    }
    return res.status(400).json({ message: error.message })
  }
}
