import { 
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";

/**
 * Lists all auth identities with their provider details.
 * Run: npx medusa exec src/scripts/list-identities.ts
 */
export default async function listIdentities({ container }) {
  const authModuleService = container.resolve(Modules.AUTH);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // Query via the graph API which resolves relations properly
  const { data: identities } = await query.graph({
    entity: "auth_identity",
    fields: ["id", "provider_identities.*"],
  });

  console.log(`\n📋 Found ${identities.length} auth identities:\n`);
  
  for (const identity of identities) {
    console.log(`─── Identity ID: ${identity.id}`);
    if (identity.provider_identities?.length) {
      for (const pi of identity.provider_identities) {
        console.log(`    Provider:   ${pi.provider}`);
        console.log(`    Entity ID:  ${pi.entity_id}`);
      }
    } else {
      console.log(`    (no provider_identities found)`);
    }
    console.log();
  }
}
