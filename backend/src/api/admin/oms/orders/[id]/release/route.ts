import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../../modules/oms"
import { isOmsStatus } from "../../../../../../utils/oms/status"
import { transitionOmsOrder } from "../../../../../../utils/oms/operations"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(OMS_MODULE)
  try {
    const order = await service.retrieveOmsOrder(req.params.id)
    if (order.oms_status !== "ON_HOLD") return res.status(409).json({ message: "Only an ON_HOLD order can be released" })
    const candidate = String(order.metadata?.held_from || "PENDING").toUpperCase()
    const next = isOmsStatus(candidate) && candidate !== "ON_HOLD" ? candidate : "PENDING"
    const updated = await transitionOmsOrder(req.scope, order, next, "admin", (req as any).auth_context?.actor_id, "Order released from hold")
    return res.json({ order: updated })
  } catch (error: any) { return res.status(error.status === 409 ? 409 : 404).json({ message: error.message }) }
}
