import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import { validateVendorOrderTransition } from "../../../../../utils/marketplace/vendor-order-state"
import { recalculateParentOrderStatus } from "../../../../../utils/marketplace/recalculate-parent-order-status"

type AllocateVendorOrderBody = {
  location_id?: string
}

export async function POST(req: MedusaRequest<AllocateVendorOrderBody>, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const vendorOrderId = req.params.id
  const locationId = req.body?.location_id
  const marketplaceService: any = req.scope.resolve(MARKETPLACE_MODULE)
  const container = req.scope

  // Optional: In a full Medusa inventory integration, we'd reserve inventory here.
  // For now, we capture location_id to prepare for fulfillment.
  // We can default or skip it if the vendor only has one location, but let's accept it if provided.

  try {
    const vendorOrder = await marketplaceService.retrieveVendorOrder(vendorOrderId)
    
    if (vendorOrder.vendor_id !== vendor.id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    if (vendorOrder.status === "processing") {
      return res.json({ success: true, message: "Inventory is already allocated", order: vendorOrder })
    }

    validateVendorOrderTransition(vendorOrder.status, "processing")

    await marketplaceService.updateVendorOrders({
      id: vendorOrderId,
      status: "processing",
      fulfillment_status: "allocated",
      processing_at: new Date().toISOString(),
      metadata: {
        ...(vendorOrder.metadata || {}),
        ...(locationId ? { location_id: locationId } : {})
      }
    })

    await marketplaceService.createVendorOrderActivities({
      vendor_order_id: vendorOrderId,
      vendor_id: vendor.id,
      type: "inventory_allocated",
      title: "Inventory allocated",
      actor_type: "vendor",
      actor_id: vendor.id
    })

    await recalculateParentOrderStatus(container, vendorOrder.order_id)

    return res.json({ success: true, message: "Inventory allocated and processing started" })
  } catch (error: any) {
    if (error.message?.includes("Invalid state transition")) {
      return res.status(409).json({ message: error.message })
    }
    return res.status(400).json({ message: error.message })
  }
}
