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
    console.log("[VENDOR_PREPARE_START]", vendorOrderId, "vendor:", vendor.id)

    const vendorOrder = await marketplaceService.retrieveVendorOrder(vendorOrderId)
    
    console.log("[VENDOR_PREPARE_STATUS_BEFORE]", vendorOrder.status, vendorOrder.fulfillment_status)

    if (vendorOrder.vendor_id !== vendor.id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    if (vendorOrder.status === "prepared") {
      return res.json({ success: true, message: "Order is already prepared", order: vendorOrder })
    }

    validateVendorOrderTransition(vendorOrder.status, "prepared")

    const now = new Date()
    const updatePayload = {
      id: vendorOrderId,
      status: "prepared",
      fulfillment_status: "preparing",
      prepared_at: now.toISOString(),
      metadata: {
        ...(vendorOrder.metadata || {}),
      },
    }

    console.log("[VENDOR_PREPARE_UPDATE_PAYLOAD]", JSON.stringify(updatePayload))

    await marketplaceService.updateVendorOrders(updatePayload)

    console.log("[VENDOR_PREPARE_UPDATED]")

    // Create activity idempotently — check if already exists
    const existingActivities = await marketplaceService.listVendorOrderActivities({
      vendor_order_id: vendorOrderId,
      type: "order_prepared",
    })

    if (!existingActivities || existingActivities.length === 0) {
      await marketplaceService.createVendorOrderActivities({
        vendor_order_id: vendorOrderId,
        vendor_id: vendor.id,
        type: "order_prepared",
        title: "Order prepared",
        description: `Order prepared by vendor ${vendor.name || vendor.id}`,
        actor_type: "vendor",
        actor_id: vendor.id,
      })
      console.log("[VENDOR_PREPARE_ACTIVITY_CREATED]")
    } else {
      console.log("[VENDOR_PREPARE_ACTIVITY_SKIPPED] already exists")
    }

    // Emit vendor-order.prepared event
    try {
      const eventBus: any = container.resolve(Modules.EVENT_BUS)
      await eventBus.emit({
        name: "vendor-order.prepared",
        data: {
          id: vendorOrderId,
          vendor_id: vendor.id,
          order_id: vendorOrder.order_id,
        },
      })
    } catch (err: any) {
      console.warn("[VENDOR_PREPARE_EVENT_EMIT_FAILED]", err?.message || err)
    }

    // Recalculate parent order status
    await recalculateParentOrderStatus(container, vendorOrder.order_id)

    // Fetch the updated vendor order to return
    const updated = await marketplaceService.retrieveVendorOrder(vendorOrderId)

    console.log("[VENDOR_PREPARE_DONE] status:", updated.status, "fulfillment:", updated.fulfillment_status)

    return res.json({ success: true, message: "Order prepared", order: updated })
  } catch (error: any) {
    console.log("[VENDOR_PREPARE_FAILED]", error.message)
    if (error.message?.includes("Invalid state transition")) {
      return res.status(409).json({ message: error.message })
    }
    return res.status(400).json({ message: error.message })
  }
}
