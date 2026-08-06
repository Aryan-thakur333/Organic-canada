import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { isActiveAssignment } from "../utils/pos/register-assignments"
import { isPosSessionOpen } from "../utils/pos/security"

const ACTOR_A = "user_01KWREHYP10FNWF3DRSGCH4Q7D"
const ACTOR_B = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"

const safe = async <T>(action: () => Promise<T>) => {
  try { return { value: await action() } } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Read-only diagnostic. It intentionally does not resolve, log, or print secrets.
export default async function auditPosActorIdentity({ container }: ExecArgs) {
  const userService = container.resolve(Modules.USER) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const posService = container.resolve(POS_MODULE) as PosModuleService

  const identities = await safe(() => query.graph({
    entity: "auth_identity",
    fields: ["id", "provider_identities.provider", "provider_identities.entity_id"],
  }))

  const users = [] as Record<string, unknown>[]
  for (const actorId of [ACTOR_A, ACTOR_B]) {
    const user = await safe(() => userService.retrieveUser(actorId))
    const assignments = await posService.listPosOperatorAssignments({ operator_id: actorId }, { take: 100 }) as any[]
    const sessions = await posService.listPosRegisterSessions({ operator_id: actorId }, { take: 100 }) as any[]
    const transactions = await safe(() => (posService as any).listPosTransactions({ operator_id: actorId }, { take: 100 }))
    const drafts = await safe(() => (posService as any).listPosOfflineDrafts({ operator_id: actorId }, { take: 100 }))
    const auditEvents = await safe(() => (posService as any).listPosAuditEvents({ operator_id: actorId }, { take: 100 }))
    const registers = await Promise.all(assignments.map(async (assignment) => {
      const register = await safe(() => posService.retrievePosRegister(assignment.register_id))
      return {
        id: assignment.id,
        register_id: assignment.register_id,
        register_name: (register.value as any)?.name || "",
        register_code: (register.value as any)?.code || "",
        role: assignment.role,
        active: isActiveAssignment(assignment),
        deleted_at: assignment.deleted_at || null,
        metadata: assignment.metadata || null,
      }
    }))
    const profile = user.value as any
    const matchingIdentity = ((identities.value as any)?.data || []).find((identity: any) =>
      (identity.provider_identities || []).some((provider: any) =>
        String(provider.entity_id || "").toLowerCase() === String(profile?.email || "").toLowerCase()
      )
    )
    users.push({
      actor_id: actorId,
      user: user.value ? {
        id: (user.value as any).id,
        email: (user.value as any).email || "",
        first_name: (user.value as any).first_name || "",
        last_name: (user.value as any).last_name || "",
        deleted_at: (user.value as any).deleted_at || null,
      } : null,
      user_error: user.error || null,
      auth_identity: matchingIdentity ? {
        id: matchingIdentity.id,
        providers: (matchingIdentity.provider_identities || []).map((provider: any) => ({ provider: provider.provider, entity_id: provider.entity_id })),
      } : null,
      assignments: registers,
      sessions: sessions.map((session) => ({
        id: session.id,
        register_id: session.register_id,
        status: session.status,
        open: isPosSessionOpen(session),
        opened_at: session.opened_at || null,
        closed_at: session.closed_at || null,
      })),
      pos_history: {
        transaction_count: Array.isArray(transactions.value) ? transactions.value.length : null,
        offline_draft_count: Array.isArray(drafts.value) ? drafts.value.length : null,
        audit_event_count: Array.isArray(auditEvents.value) ? auditEvents.value.length : null,
      },
    })
  }

  const report = { read_only: true, actors: users }
  console.log(`[POS_ACTOR_IDENTITY_AUDIT] ${JSON.stringify(report)}`)
}
