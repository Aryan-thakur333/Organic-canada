import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../modules/oms"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendorId = (req as any).vendor?.id
  const service: any = req.scope.resolve(OMS_MODULE)
  try {
    const order = await service.retrieveOmsVendorOrder(req.params.id)
    if (order.vendor_id !== vendorId) return res.status(403).json({ message: "Forbidden" })
    const [events, assignments] = await Promise.all([
      service.listOmsOrderEvents({ vendor_order_id: order.id }, { order: { created_at: "ASC" } }),
      service.listOmsFulfillmentAssignments({ vendor_order_id: order.id }),
    ])
    return res.json({ order: { ...order, timeline: events, fulfillment_assignments: assignments } })
  } catch { return res.status(404).json({ message: "OMS vendor order not found" }) }
}
