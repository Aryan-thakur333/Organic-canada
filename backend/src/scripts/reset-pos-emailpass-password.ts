import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const CANONICAL_EMAIL = "admin@eatsie.com"
const CANONICAL_ACTOR_ID = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"

// Explicit credential repair only. It never creates users, touches POS data, or
// runs from an HTTP handler. APPLY remains false unless set exactly to "true".
export default async function resetPosEmailpassPassword({ container }: ExecArgs) {
  const email = String(process.env.POS_PASSWORD_RESET_EMAIL || "").trim().toLowerCase()
  const password = String(process.env.POS_PASSWORD_RESET_NEW_PASSWORD || "")
  const apply = process.env.POS_PASSWORD_RESET_APPLY === "true"
  if (email !== CANONICAL_EMAIL) throw new Error(`POS_PASSWORD_RESET_EMAIL must be ${CANONICAL_EMAIL}`)
  if (apply && !password) throw new Error("POS_PASSWORD_RESET_NEW_PASSWORD is required when POS_PASSWORD_RESET_APPLY=true")

  const authService = container.resolve(Modules.AUTH) as any
  const identities = await authService.listAuthIdentities({
    provider_identities: { provider: "emailpass", entity_id: email },
  }) as any[]
  if (identities.length !== 1) throw new Error("Expected exactly one emailpass identity for the canonical POS account")
  const identity = identities[0]
  const actorId = String(identity.app_metadata?.user_id || "")
  if (actorId !== CANONICAL_ACTOR_ID) throw new Error("Emailpass identity is not linked to the canonical POS actor")

  console.log(`[POS_PASSWORD_RESET_REPORT] ${JSON.stringify({ apply, email, auth_identity_id: identity.id, actor_id: actorId, password_supplied: Boolean(password), password_updated: false })}`)
  if (!apply) return
  const updated = await authService.updateProvider("emailpass", { entity_id: email, password })
  if (!updated?.success) throw new Error(updated?.error || "Emailpass password update failed")
  console.log(`[POS_PASSWORD_RESET_RESULT] ${JSON.stringify({ apply, email, auth_identity_id: identity.id, actor_id: actorId, provider: "emailpass", password_updated: true })}`)
}
