import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import { loadAssignedPosRegisters } from "../utils/pos/register-assignments"

const EMAIL = "admin@eatsie.com"
const EXPECTED_POS_ACTOR_ID = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"
const EXPECTED_AUTH_IDENTITY_ID = "authid_01KWPV0WHJNVAJBT9R21XYSYPY"

export default async function posIdentityDiagnostic({ container }: ExecArgs) {
  console.log("=== POS IDENTITY DIAGNOSTIC CLI ===")
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
  const authService = container.resolve(Modules.AUTH) as any
  const posService = container.resolve(POS_MODULE) as any

  // 1. Inspect Auth Identity -> Actor Mapping
  const identities = await authService.listAuthIdentities({
    provider_identities: { provider: "emailpass", entity_id: EMAIL },
  }) as any[]
  
  if (identities.length === 0) {
    logger.info(`[DIAGNOSTIC] No auth identity found for email: ${EMAIL}`)
    return
  }

  const identity = identities[0]
  const actorId = String(identity.app_metadata?.user_id || "").trim()
  const authIdentityId = identity.id

  logger.info(`[DIAGNOSTIC] Auth Identity ID: ${authIdentityId}`)
  logger.info(`[DIAGNOSTIC] Extracted Actor ID (app_metadata.user_id): ${actorId}`)
  
  const authIdentityMatch = authIdentityId === EXPECTED_AUTH_IDENTITY_ID ? "PASS" : "FAIL"
  const actorMatch = actorId === EXPECTED_POS_ACTOR_ID ? "PASS" : "FAIL"
  logger.info(`[DIAGNOSTIC] Auth identity ID matches expected (${EXPECTED_AUTH_IDENTITY_ID}): ${authIdentityMatch}`)
  logger.info(`[DIAGNOSTIC] Actor ID matches expected (${EXPECTED_POS_ACTOR_ID}): ${actorMatch}`)

  // 2. Inspect Actor -> pos_operator_assignment & registers
  if (!actorId) {
    logger.info("[DIAGNOSTIC] Actor ID is missing from auth identity, aborting assignment checks.")
    return
  }

  const snapshot = await loadAssignedPosRegisters(posService, actorId)
  const assignments = snapshot.assignments
  const registers = snapshot.registers

  logger.info(`[DIAGNOSTIC] Active assignments count: ${assignments.length}`)
  logger.info(`[DIAGNOSTIC] Assigned registers count: ${registers.length}`)

  const assignmentOperatorIds = assignments.map((a: any) => a.operator_id)
  const registerIds = registers.map((r: any) => r.id)

  logger.info(`[DIAGNOSTIC] Assignment operator IDs: ${JSON.stringify(assignmentOperatorIds)}`)
  logger.info(`[DIAGNOSTIC] Register IDs: ${JSON.stringify(registerIds)}`)

  const canadaRegisterMatch = registerIds.includes("01KYMKWP9FAB13SGT4Z5XTW6R2") ? "PASS" : "FAIL"
  const usaRegisterMatch = registerIds.includes("01KYMKWP9T4YWNMZA47AZNQSY3") ? "PASS" : "FAIL"

  logger.info(`[DIAGNOSTIC] Canada register assigned (01KYMKWP9FAB13SGT4Z5XTW6R2): ${canadaRegisterMatch}`)
  logger.info(`[DIAGNOSTIC] USA register assigned (01KYMKWP9T4YWNMZA47AZNQSY3): ${usaRegisterMatch}`)

  const overall = (authIdentityMatch === "PASS" && actorMatch === "PASS" && canadaRegisterMatch === "PASS" && usaRegisterMatch === "PASS") ? "PASS" : "FAIL"
  logger.info(`[DIAGNOSTIC] Overall canonical identity diagnostic: ${overall}`)
}
