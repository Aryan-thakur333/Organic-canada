import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../../modules/oms"
import { customerSafeOrder } from "../../../../../../utils/oms/responses"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Authentication required" })
  const service: any = req.scope.resolve(OMS_MODULE)
  const orders = await service.listOmsOrders({ customer_id: customerId }, { order: { created_at: "DESC" }, take: 100 })
  const result = await Promise.all(orders.map(async (order: any) => customerSafeOrder(
    order,
    await service.listOmsVendorOrders({ oms_order_id: order.id }),
    await service.listOmsOrderEvents({ oms_order_id: order.id }, { order: { created_at: "ASC" } })
  )))
  return res.json({ orders: result })
}
