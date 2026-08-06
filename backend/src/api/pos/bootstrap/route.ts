import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../../modules/pos"
import { PosError, posErrorResponse } from "../../../utils/pos/contracts"
import { isActiveAssignment } from "../../../utils/pos/register-assignments"
import { resolveCurrentPosContext, sanitizeRegister, sanitizeSession } from "../../../utils/pos/security"

const confirmedAssignmentCounts = new Map<string, number>()

async function logIdentityAssignmentMismatch(req: MedusaRequest, actorId: string, email: string, assignmentCount: number) {
  if (process.env.NODE_ENV === "production" || assignmentCount > 0 || !email) return
  try {
    const userService = req.scope.resolve(Modules.USER) as { listUsers(filters: Record<string, unknown>, config?: Record<string, unknown>): Promise<Array<{ id: string }>> }
    const posService = req.scope.resolve(POS_MODULE) as { listPosOperatorAssignments(filters: Record<string, unknown>, config?: Record<string, unknown>): Promise<Array<Record<string, unknown>>> }
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
    const users = await userService.listUsers({ email }, { take: 10 })
    const matches = [] as Array<{ actorId: string; activeAssignmentCount: number }>
    for (const user of users) {
      if (user.id === actorId) continue
      const assignments = await posService.listPosOperatorAssignments({ operator_id: user.id }, { take: 100 })
      const activeAssignmentCount = assignments.filter(isActiveAssignment).length
      if (activeAssignmentCount > 0) matches.push({ actorId: user.id, activeAssignmentCount })
    }
    if (matches.length) logger.info(`[POS_IDENTITY_ASSIGNMENT_MISMATCH] ${JSON.stringify({ actorId, email, matches })}`)
  } catch {
    // Diagnostics must never change bootstrap authorization or availability.
  }
}

// Canonical POS startup resolution. Keep this self-contained: it deliberately
// uses shared helpers rather than calling legacy POS HTTP endpoints.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store, private")
  try {
    const authContext = (req as any).auth_context
    const canonicalActorId = String(authContext?.actor_id || "").trim()
    if (!canonicalActorId) {
      throw new PosError("POS_AUTH_ACTOR_ID_MISSING", "Missing actor identity.", 401)
    }

    // Safe identity diagnostic: never logs tokens or secrets.
    if (process.env.NODE_ENV !== "production") {
      const authContextAny = authContext as { actor_id?: string; auth_identity_id?: string } | null
      const entryLogger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
      entryLogger.info(`[POS_BOOTSTRAP_AUTH_CONTEXT] ${JSON.stringify({
        actor_id: canonicalActorId,
        auth_identity_id: String(authContextAny?.auth_identity_id || ""),
      })}`)
    }

    // Invariant mismatch must be reported BEFORE context resolution. Otherwise
    // a schema-corrupted assignment belonging to another actor would first trip
    // the register-bound assertion inside resolveCurrentPosContext and surface
    // as POS_REGISTER_NOT_ASSIGNED instead of the explicit actor invariant.
    const posService = req.scope.resolve(POS_MODULE) as any
    const assignments = await posService.listPosOperatorAssignments(
      { operator_id: canonicalActorId },
      { take: 100 }
    )
    for (const assignment of assignments) {
      if (assignment.operator_id && String(assignment.operator_id).trim() !== canonicalActorId) {
        throw new PosError("POS_OPERATOR_ACTOR_INVARIANT_FAILED", "POS operator actor invariant mismatch.", 403)
      }
    }

    const context = await resolveCurrentPosContext(req)

    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
    const register = sanitizeRegister(context.activeRegister)
    const session = sanitizeSession(context.session)
    const diagnostics = {
      actorId: context.actorId,
      operatorId: context.operatorId,
      assignmentCount: context.assignmentCount,
      activeAssignmentCount: context.activeAssignmentCount,
      registerCount: context.assignedRegisters.length,
      activeRegisterCount: context.activeRegisterCount,
      sessionId: String(session?.id || ""),
      sessionRegisterId: String(session?.register_id || ""),
    }

    if (process.env.NODE_ENV !== "production") {
      logger.info(`[POS_BOOTSTRAP] ${JSON.stringify(diagnostics)}`)
      if (context.assignmentCount > 0 && context.assignedRegisters.length === 0) {
        logger.info(`[POS_BOOTSTRAP_INVARIANT_FAILED] ${JSON.stringify(diagnostics)}`)
      }
      const previousCount = confirmedAssignmentCounts.get(context.actorId) || 0
      if (previousCount > 0 && context.activeAssignmentCount === 0) {
        logger.info(`[POS_ASSIGNMENT_UNEXPECTED_DISAPPEARANCE] ${JSON.stringify({
          actorId: context.actorId,
          previousActiveAssignmentCount: previousCount,
          activeAssignmentCount: context.activeAssignmentCount,
          assignmentRegisterIds: context.assignedRegisters.map((entry) => entry.id),
        })}`)
      }
      confirmedAssignmentCounts.set(context.actorId, context.activeAssignmentCount)
      await logIdentityAssignmentMismatch(req, context.actorId, context.email, context.activeAssignmentCount)
    }

    return res.json({
      authenticated: true,
      operator: {
        id: context.operatorId,
        actor_id: canonicalActorId,
        user_id: context.operatorUserId,
        email: context.email,
        role: context.role,
        status: String(context.operatorStatus || "active").toLowerCase(),
      },
      registers: context.assignedRegisters,
      assignment_state: context.activeAssignmentCount === 0 ? "empty" : "ready",
      session: session ? { ...session, register } : null,
      meta: {
        generated_at: new Date().toISOString(),
        operator_id: context.operatorId,
        assignment_count: context.activeAssignmentCount,
        register_count: context.assignedRegisters.length,
        context_version: "pos-bootstrap-v1",
      },
    })
  } catch (error) {
    if (error instanceof PosError && error.code === "POS_UNAUTHENTICATED") {
      return res.status(401).json({ code: "POS_AUTH_REQUIRED", message: "POS authentication required" })
    }
    const response = posErrorResponse(error)
    return res.status(response.status).json(response.body)
  }
}
