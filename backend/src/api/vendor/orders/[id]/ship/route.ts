import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import { validateVendorOrderTransition } from "../../../../../utils/marketplace/vendor-order-state"
import { createOrderShipmentWorkflow } from "@medusajs/core-flows"
import { recalculateParentOrderStatus } from "../../../../../utils/marketplace/recalculate-parent-order-status"
import { resolveVendorFulfillment } from "../../../../../utils/marketplace/resolve-vendor-fulfillment"

type ShipVendorOrderBody = {
  carrier?: string
  service?: string
  tracking_number?: string
  tracking_url?: string
}

export async function POST(req: MedusaRequest<ShipVendorOrderBody>, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const vendorOrderId = req.params.id
  const { carrier, service, tracking_number, tracking_url } = req.body
  const marketplaceService: any = req.scope.resolve(MARKETPLACE_MODULE)
  const container = req.scope

  try {
    const vendorOrder = await marketplaceService.retrieveVendorOrder(vendorOrderId, {
      relations: ["items"]
    })
    
    if (vendorOrder.vendor_id !== vendor.id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    if (vendorOrder.status === "shipped" || vendorOrder.status === "delivered") {
      return res.json({ success: true, message: "Order is already shipped", order: vendorOrder })
    }

    if (!tracking_number) {
      return res.status(400).json({ message: "tracking_number is required to mark order as shipped." })
    }

    validateVendorOrderTransition(vendorOrder.status, "shipped")

    // Resolve native fulfillment
    const resolved = await resolveVendorFulfillment(container, vendorOrderId)
    if (!resolved.is_fulfilled) {
      return res.status(400).json({ message: "Cannot ship before a native fulfillment is created." })
    }
    const fulfillmentId = resolved.fulfillment_id

    const items = vendorOrder.items.map((i: any) => ({
      id: i.line_item_id || i.order_item_id, // native medusa item id
      quantity: i.quantity
    }))

    // Execute native shipment workflow
    await createOrderShipmentWorkflow(container).run({
      input: {
        order_id: vendorOrder.order_id,
        fulfillment_id: fulfillmentId,
        items,
        labels: [{
          tracking_number: tracking_number || "",
          tracking_url: tracking_url || "",
          label_url: ""
        }],
      }
    })

    await marketplaceService.updateVendorOrders({
      id: vendorOrderId,
      status: "shipped",
      fulfillment_status: "shipped",
      shipped_at: new Date().toISOString(),
      metadata: {
        ...(vendorOrder.metadata || {}),
        carrier,
        service: service || "Expedited Parcel",
        tracking_number,
        tracking_url,
        tracking: { carrier, tracking_number, tracking_url },
        fulfillment_id: fulfillmentId
      }
    })

    await marketplaceService.createVendorOrderActivities({
      vendor_order_id: vendorOrderId,
      vendor_id: vendor.id,
      type: "shipment_created",
      title: "Order shipped",
      actor_type: "vendor",
      actor_id: vendor.id
    })

    await recalculateParentOrderStatus(container, vendorOrder.order_id)

    const updated = await marketplaceService.retrieveVendorOrder(vendorOrderId)

    return res.json({ success: true, message: "Order shipped", order: updated })
  } catch (error: any) {
    if (error.message?.includes("Invalid state transition")) {
      return res.status(409).json({ message: error.message })
    }
    return res.status(400).json({ message: error.message })
  }
}
