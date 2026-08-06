import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../../modules/oms"
import { transitionVendorOrder } from "../../../../../../utils/oms/operations"

type Body = { carrier?: string; tracking_number?: string; tracking_url?: string }
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const vendorId = (req as any).vendor?.id
  const service: any = req.scope.resolve(OMS_MODULE)
  if (!req.body?.carrier || !req.body?.tracking_number) return res.status(400).json({ message: "carrier and tracking_number are required" })
  try {
    const order = await service.retrieveOmsVendorOrder(req.params.id)
    if (order.vendor_id !== vendorId) return res.status(403).json({ message: "Forbidden" })
    if (Number(order.metadata?.physical_item_count || 0) < 1) return res.status(409).json({ message: "Digital-only orders cannot create physical shipments" })
    const tracking = { carrier: req.body.carrier, tracking_number: req.body.tracking_number, tracking_url: req.body.tracking_url || null }
    const updated = await transitionVendorOrder(req.scope, order, "SHIPPED", "vendor", vendorId, { tracking })
    await service.updateOmsVendorOrders({ id: order.id, fulfillment_status: "SHIPPED" })
    return res.json({ order: updated })
  } catch (error: any) { return res.status(error.status === 409 ? 409 : 404).json({ message: error.message }) }
}
