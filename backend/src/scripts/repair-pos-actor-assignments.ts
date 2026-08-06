import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { isActiveAssignment } from "../utils/pos/register-assignments"
import { isPosSessionOpen } from "../utils/pos/security"

type Assignment = { id: string; operator_id: string; register_id: string; role: string; active: boolean; metadata?: Record<string, unknown> | null }

// Explicit, idempotent repair. It is never invoked by HTTP handlers or startup.
// Dry run: POS_REPAIR_SOURCE_ACTOR_ID=<old> POS_REPAIR_TARGET_ACTOR_ID=<current> npm.cmd exec medusa exec ./src/scripts/repair-pos-actor-assignments.ts
// Apply: add POS_REPAIR_APPLY=true to the command above.
export default async function repairPosActorAssignments({ container }: ExecArgs) {
  const sourceActorId = String(process.env.POS_REPAIR_SOURCE_ACTOR_ID || "").trim()
  const targetActorId = String(process.env.POS_REPAIR_TARGET_ACTOR_ID || "").trim()
  const apply = process.env.POS_REPAIR_APPLY === "true"
  if (!sourceActorId || !targetActorId) throw new Error("POS_REPAIR_SOURCE_ACTOR_ID and POS_REPAIR_TARGET_ACTOR_ID are required")
  if (sourceActorId === targetActorId) throw new Error("Source and target actors must differ")

  const service = container.resolve(POS_MODULE) as PosModuleService
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
  const source = (await service.listPosOperatorAssignments({ operator_id: sourceActorId }, { take: 100 }) as Assignment[]).filter(isActiveAssignment)
  const target = (await service.listPosOperatorAssignments({ operator_id: targetActorId }, { take: 100 }) as Assignment[]).filter(isActiveAssignment)
  const targetByRegister = new Map(target.map((assignment) => [assignment.register_id, assignment]))
  const wouldReassign: string[] = []
  const wouldSkip: string[] = []
  const duplicates: string[] = []

  for (const assignment of source) {
    const existing = targetByRegister.get(assignment.register_id)
    if (!existing) wouldReassign.push(assignment.id)
    else {
      wouldSkip.push(assignment.id)
      duplicates.push(assignment.register_id)
    }
  }
  const sourceSessions = await service.listPosRegisterSessions({ operator_id: sourceActorId }, { take: 100 }) as any[]
  const staleOpenSessions = sourceSessions.filter(isPosSessionOpen)
  const report = {
    apply,
    source_actor_id: sourceActorId,
    target_actor_id: targetActorId,
    source_assignments: source.map((assignment) => ({ id: assignment.id, register_id: assignment.register_id, role: assignment.role, active: assignment.active })),
    target_assignments: target.map((assignment) => ({ id: assignment.id, register_id: assignment.register_id, role: assignment.role, active: assignment.active })),
    wouldReassign,
    wouldSkip,
    duplicates,
    sessions_affected: staleOpenSessions.map((session) => ({ id: session.id, register_id: session.register_id })),
  }
  logger.info(`[POS_ACTOR_ASSIGNMENT_REPAIR_REPORT] ${JSON.stringify(report)}`)
  if (!apply) return

  for (const assignment of source) {
    if (targetByRegister.has(assignment.register_id)) {
      // An existing target assignment wins. Disabling the obsolete source row
      // preserves its history while ensuring the old actor loses access.
      await service.updatePosOperatorAssignments({ id: assignment.id, active: false })
      logger.info(`[POS_ASSIGNMENT_MUTATION] ${JSON.stringify({ action: "DEACTIVATE_DUPLICATE_SOURCE", assignmentId: assignment.id, sourceActorId, targetActorId, registerId: assignment.register_id, source: "repair-pos-actor-assignments" })}`)
    } else {
      await service.updatePosOperatorAssignments({ id: assignment.id, operator_id: targetActorId })
      logger.info(`[POS_ASSIGNMENT_MUTATION] ${JSON.stringify({ action: "REASSIGN", assignmentId: assignment.id, sourceActorId, targetActorId, registerId: assignment.register_id, source: "repair-pos-actor-assignments" })}`)
    }
  }
  for (const session of staleOpenSessions) {
    await service.updatePosRegisterSessions({ id: session.id, status: "CLOSED", closed_at: new Date() })
    logger.info(`[POS_SESSION_MUTATION] ${JSON.stringify({ action: "CLOSE_STALE_ACTOR_SESSION", sessionId: session.id, sourceActorId, targetActorId, registerId: session.register_id, source: "repair-pos-actor-assignments" })}`)
  }
  const finalAssignments = (await service.listPosOperatorAssignments({ operator_id: targetActorId }, { take: 100 }) as Assignment[]).filter(isActiveAssignment)
  logger.info(`[POS_ACTOR_ASSIGNMENT_REPAIR_RESULT] ${JSON.stringify({ targetActorId, activeRegisterIds: finalAssignments.map((assignment) => assignment.register_id), activeAssignmentCount: finalAssignments.length })}`)
}
