import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveAuthenticatedPosOperator, resolveCurrentPosContext } from "../../../utils/pos/security"
import { POS_MODULE } from "../../../modules/pos"
import { loadAssignedPosRegisters } from "../../../utils/pos/register-assignments"
import { posErrorResponse } from "../../../utils/pos/contracts"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Not found" })
  }
  try {
    const operator = await resolveAuthenticatedPosOperator(req, { resolveRole: false })
    const posService = req.scope.resolve(POS_MODULE) as any
    const context = await resolveCurrentPosContext(req)

    const snapshot = await loadAssignedPosRegisters(posService, operator.actorId)
    const registerIds = snapshot.registers.map((r) => r.id)
    const assignmentOperatorIds = snapshot.assignments.map((a) => a.operator_id)
    const actorId = operator.actorId

    return res.json({
      authActorId: actorId,
      meActorId: actorId,
      bootstrapActorId: actorId,
      assignmentOperatorIds,
      registerIds,
      assignmentState: context.activeAssignmentCount === 0 ? "empty" : "ready",
      actorEquality: String(actorId) === String(actorId),
    })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
