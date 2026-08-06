import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../../modules/oms"
import { transitionVendorOrder } from "../../../../../../utils/oms/operations"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendorId = (req as any).vendor?.id
  const service: any = req.scope.resolve(OMS_MODULE)
  try {
    const order = await service.retrieveOmsVendorOrder(req.params.id)
    if (order.vendor_id !== vendorId) return res.status(403).json({ message: "Forbidden" })
    return res.json({ order: await transitionVendorOrder(req.scope, order, "CONFIRMED", "vendor", vendorId) })
  } catch (error: any) { return res.status(error.status === 409 ? 409 : 404).json({ message: error.message }) }
}
