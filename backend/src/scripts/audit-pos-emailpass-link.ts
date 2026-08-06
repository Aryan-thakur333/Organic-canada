import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const EMAIL = "admin@eatsie.com"
const EXPECTED_POS_ACTOR_ID = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"

// Read-only. Deliberately excludes provider metadata, passwords, and tokens.
export default async function auditPosEmailpassLink({ container }: ExecArgs) {
  const authService = container.resolve(Modules.AUTH) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const identities = await authService.listAuthIdentities({
    provider_identities: { provider: "emailpass", entity_id: EMAIL },
  }) as any[]
  const graph = await query.graph({
    entity: "auth_identity",
    fields: ["id", "provider_identities.id", "provider_identities.provider", "provider_identities.entity_id"],
    filters: { id: identities.map((identity) => identity.id) },
  })
  const graphById = new Map((graph.data || []).map((identity: any) => [identity.id, identity]))
  const report = identities.map((identity) => ({
    auth_identity_id: identity.id,
    provider_identities: ((graphById.get(identity.id) as any)?.provider_identities || [])
      .filter((provider: any) => provider.provider === "emailpass")
      .map((provider: any) => ({ id: provider.id, provider: provider.provider, entity_id: provider.entity_id })),
    actor_id: String(identity.app_metadata?.user_id || ""),
    actor_type: "user",
    actor_matches_expected_pos_actor: String(identity.app_metadata?.user_id || "") === EXPECTED_POS_ACTOR_ID,
  }))
  console.log(`[POS_EMAILPASS_LINK_AUDIT] ${JSON.stringify({ email: EMAIL, identity_exists: report.length > 0, expected_pos_actor_id: EXPECTED_POS_ACTOR_ID, identities: report })}`)
}
