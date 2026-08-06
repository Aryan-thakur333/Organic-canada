import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../../../modules/oms"
import { customerSafeOrder } from "../../../../../../../utils/oms/responses"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Authentication required" })
  const service: any = req.scope.resolve(OMS_MODULE)
  try {
    const order = await service.retrieveOmsOrder(req.params.id)
    if (order.customer_id !== customerId) return res.status(404).json({ message: "OMS order not found" })
    const [vendorOrders, events] = await Promise.all([service.listOmsVendorOrders({ oms_order_id: order.id }), service.listOmsOrderEvents({ oms_order_id: order.id }, { order: { created_at: "ASC" } })])
    return res.json({ order: customerSafeOrder(order, vendorOrders, events) })
  } catch { return res.status(404).json({ message: "OMS order not found" }) }
}
