import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../../modules/oms"
import { transitionVendorOrder } from "../../../../../../utils/oms/operations"

export async function POST(req: MedusaRequest<{ reason?: string }>, res: MedusaResponse) {
  const vendorId = (req as any).vendor?.id
  const service: any = req.scope.resolve(OMS_MODULE)
  try {
    const order = await service.retrieveOmsVendorOrder(req.params.id)
    if (order.vendor_id !== vendorId) return res.status(403).json({ message: "Forbidden" })
    const updated = await transitionVendorOrder(req.scope, order, "CANCELLED", "vendor", vendorId, { rejection_reason: req.body?.reason || null })
    await service.createOmsCancellationRequests({ oms_order_id: order.oms_order_id, vendor_order_id: order.id, status: "REJECTED_BY_VENDOR", reason: req.body?.reason || null, requested_by_type: "vendor", requested_by_id: vendorId, metadata: null })
    return res.json({ order: updated })
  } catch (error: any) { return res.status(error.status === 409 ? 409 : 404).json({ message: error.message }) }
}
