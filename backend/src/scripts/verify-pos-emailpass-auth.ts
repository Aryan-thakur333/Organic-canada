import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { loadAssignedPosRegisters } from "../utils/pos/register-assignments"

const EMAIL = "admin@eatsie.com"
const CANONICAL_ACTOR_ID = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"

// Programmatic provider verification. It prints neither credential material nor tokens.
export default async function verifyPosEmailpassAuth({ container }: ExecArgs) {
  const password = String(process.env.POS_AUTH_VERIFY_PASSWORD || "")
  if (!password) throw new Error("POS_AUTH_VERIFY_PASSWORD is required")
  const authService = container.resolve(Modules.AUTH) as any
  const response = await authService.authenticate("emailpass", { body: { email: EMAIL, password } })
  if (!response?.success || !response.authIdentity) throw new Error("POS_EMAILPASS_AUTH_FAILED")
  const actorId = String(response.authIdentity.app_metadata?.user_id || "")
  if (actorId !== CANONICAL_ACTOR_ID) throw new Error("POS_AUTH_IDENTITY_MISMATCH")

  const posService = container.resolve(POS_MODULE) as PosModuleService
  const snapshot = await loadAssignedPosRegisters(posService as any, actorId)
  const registerNames = snapshot.registers.map((register) => register.name)
  const canada = registerNames.includes("Canada POS Register")
  const usa = registerNames.includes("USA POS Register")
  if (!canada || !usa || snapshot.registers.length !== 2) throw new Error("POS_BOOTSTRAP_ASSIGNMENT_VERIFICATION_FAILED")
  console.log(`[POS_EMAILPASS_AUTH_VERIFICATION] ${JSON.stringify({ email: EMAIL, authenticated: true, actor_id: actorId, token_emitted: false, assignment_state: "ready", register_count: snapshot.registers.length, canada, usa })}`)
}
