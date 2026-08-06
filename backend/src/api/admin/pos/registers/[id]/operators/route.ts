import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../../../../../modules/pos"
import { PosError, posErrorResponse, type PosRecord, type PosService } from "../../../../../../utils/pos/contracts"
import { appendPosAudit, requirePosRegisterAssignment } from "../../../../../../utils/pos/security"

export async function POST(req: MedusaRequest<{ operator_id?: string; role?: string }>, res: MedusaResponse) {
  try {
    const operatorId = String(req.body?.operator_id || "").trim()
    const role = String(req.body?.role || "POS_OPERATOR").toUpperCase()
    if (!operatorId || !["POS_OPERATOR", "POS_MANAGER", "ADMIN"].includes(role)) throw new PosError("POS_VALIDATION_ERROR", "Valid operator_id and role are required", 400)
    const service = req.scope.resolve(POS_MODULE) as PosService
    let register: PosRecord
    try { register = await service.retrievePosRegister(req.params.id) as PosRecord }
    catch { throw new PosError("POS_REGISTER_NOT_FOUND", "Register not found", 404) }
    if (register.status !== "ACTIVE") throw new PosError("POS_REGISTER_INACTIVE", "Register is not active", 409)
    const userService = req.scope.resolve(Modules.USER) as { retrieveUser(id: string): Promise<unknown> }
    try { await userService.retrieveUser(operatorId) }
    catch { throw new PosError("POS_OPERATOR_NOT_FOUND", "POS operator user not found", 404) }
    const current = await service.listPosOperatorAssignments({ register_id: req.params.id, operator_id: operatorId }, { take: 10 }) as PosRecord[]
    if (current.length > 1) throw new PosError("POS_DUPLICATE_ASSIGNMENT", "Conflicting operator assignments require administrative review", 409)
    const existing = current[0]
    if (existing?.active === true && existing.role === role) {
      await requirePosRegisterAssignment({ service, operatorId, registerId: req.params.id })
      return res.status(200).json({ assignment: existing, idempotent: true, database_writes: 0 })
    }
    const assignment = (existing
      ? await service.updatePosOperatorAssignments({ id: existing.id, role, active: true })
      : await service.createPosOperatorAssignments({ register_id: req.params.id, operator_id: operatorId, role, active: true, metadata: { assigned_by: "admin_pos_api" } })) as PosRecord
    if (process.env.NODE_ENV !== "production") {
      const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
      logger.info(`[POS_ASSIGNMENT_MUTATION] ${JSON.stringify({
        action: existing ? "REACTIVATE" : "CREATE",
        assignmentId: assignment.id,
        operatorId,
        registerId: req.params.id,
        source: "admin_pos_api",
      })}`)
    }
    const assigningActorId = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id || null
    await appendPosAudit(service, {
      register_id: req.params.id,
      operator_id: operatorId,
      event_type: existing ? "POS_OPERATOR_ASSIGNMENT_REACTIVATED" : "POS_OPERATOR_ASSIGNMENT_CREATED",
      metadata: {
        assignment_id: assignment.id,
        role,
        assigned_by_actor_id: assigningActorId,
      },
    })
    return res.status(existing ? 200 : 201).json({ assignment, idempotent: false, database_writes: 1 })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
