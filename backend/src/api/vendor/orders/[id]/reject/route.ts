import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import { validateVendorOrderTransition } from "../../../../../utils/marketplace/vendor-order-state"

type RejectVendorOrderBody = {
  reason?: string
}

export async function POST(req: MedusaRequest<RejectVendorOrderBody>, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const vendorOrderId = req.params.id
  const reason = req.body?.reason || "No reason provided"
  const marketplaceService: any = req.scope.resolve(MARKETPLACE_MODULE)

  try {
    const vendorOrder = await marketplaceService.retrieveVendorOrder(vendorOrderId)
    
    if (vendorOrder.vendor_id !== vendor.id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    validateVendorOrderTransition(vendorOrder.status, "rejected")

    await marketplaceService.updateVendorOrders({
      id: vendorOrderId,
      status: "rejected",
      rejection_reason: reason,
      rejected_at: new Date().toISOString()
    })

    await marketplaceService.createVendorOrderActivities({
      vendor_order_id: vendorOrderId,
      vendor_id: vendor.id,
      type: "order_rejected",
      title: "Order rejected",
      description: reason,
      actor_type: "vendor",
      actor_id: vendor.id
    })

    return res.json({ success: true, message: "Order rejected" })
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
}
