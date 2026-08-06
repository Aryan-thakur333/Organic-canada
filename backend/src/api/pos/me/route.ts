import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveAuthenticatedPosOperator } from "../../../utils/pos/security"
import { posErrorResponse } from "../../../utils/pos/contracts"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const operator = await resolveAuthenticatedPosOperator(req)
    return res.json({
      operator_id: operator.operatorId,
      actor_id: operator.actorId,
      operator_user_id: operator.operatorUserId,
      email: operator.email,
      role: operator.role,
      operator: {
        id: operator.operatorId,
        operator_id: operator.operatorId,
        user_id: operator.operatorUserId,
        actor_id: operator.actorId,
        status: operator.operatorStatus,
        identity_source: operator.identitySource,
        email: operator.email,
        role: operator.role,
        permissions: operator.permissions,
      },
    })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
