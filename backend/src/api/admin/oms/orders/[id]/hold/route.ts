import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../../modules/oms"
import { transitionOmsOrder } from "../../../../../../utils/oms/operations"

export async function POST(req: MedusaRequest<{ reason?: string }>, res: MedusaResponse) {
  const service: any = req.scope.resolve(OMS_MODULE)
  try {
    const order = await service.retrieveOmsOrder(req.params.id)
    const updated = await transitionOmsOrder(req.scope, order, "ON_HOLD", "admin", (req as any).auth_context?.actor_id, req.body?.reason || "Order placed on hold")
    await service.updateOmsOrders({ id: order.id, metadata: { ...(order.metadata || {}), held_from: order.oms_status, hold_reason: req.body?.reason || null } })
    await service.createOmsOrderEvents({ oms_order_id: order.id, event_type: "ORDER_ON_HOLD", previous_status: order.oms_status, new_status: "ON_HOLD", actor_type: "admin", actor_id: (req as any).auth_context?.actor_id || null, message: req.body?.reason || "Order placed on hold", metadata: null })
    return res.json({ order: updated })
  } catch (error: any) { return res.status(error.status === 409 ? 409 : 404).json({ message: error.message }) }
}
