import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../../modules/oms"
import { isOmsStatus } from "../../../../../../utils/oms/status"
import { transitionOmsOrder } from "../../../../../../utils/oms/operations"

export async function POST(req: MedusaRequest<{ status: string; message?: string }>, res: MedusaResponse) {
  const service: any = req.scope.resolve(OMS_MODULE)
  const status = String(req.body?.status || "").toUpperCase()
  if (!isOmsStatus(status)) return res.status(400).json({ message: "Unknown OMS status" })
  try {
    const order = await service.retrieveOmsOrder(req.params.id)
    const updated = await transitionOmsOrder(req.scope, order, status, "admin", (req as any).auth_context?.actor_id, req.body?.message)
    return res.json({ order: updated })
  } catch (error: any) { return res.status(error.status === 409 ? 409 : 404).json({ message: error.message }) }
}
