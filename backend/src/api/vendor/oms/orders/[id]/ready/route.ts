import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../../modules/oms"
import { transitionVendorOrder } from "../../../../../../utils/oms/operations"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendorId = (req as any).vendor?.id
  const service: any = req.scope.resolve(OMS_MODULE)
  try {
    const order = await service.retrieveOmsVendorOrder(req.params.id)
    if (order.vendor_id !== vendorId) return res.status(403).json({ message: "Forbidden" })
    if (order.metadata?.physical_item_count > 0 && !order.assigned_location_id) return res.status(409).json({ message: "A fulfillment location is required" })
    return res.json({ order: await transitionVendorOrder(req.scope, order, "READY_FOR_FULFILLMENT", "vendor", vendorId) })
  } catch (error: any) { return res.status(error.status === 409 ? 409 : 404).json({ message: error.message }) }
}
