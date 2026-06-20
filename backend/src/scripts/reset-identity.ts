import { 
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";

/**
 * This script resets the Medusa auth identity password for a Firebase-synced user.
 * It sets the password to the user's Firebase UID so the bridge login works correctly.
 * 
 * Usage: npx medusa exec src/scripts/reset-identity.ts
 */
export default async function resetIdentity({ container }) {
  const authModuleService = container.resolve(Modules.AUTH);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // ===== CONFIGURE THESE =====
  const targetEmail    = "unforgetable523566@gmail.com";
  const newPassword    = "1C04LcvaqjOu3NtsTzDa1pLvzX03"; // Firebase UID — replace if needed
  // ============================

  console.log(`\n🔍 Looking up identity for: ${targetEmail}`);

  // Find the auth identity
  const identities = await authModuleService.listAuthIdentities({
    provider_identities: { entity_id: targetEmail, provider: "emailpass" }
  });

  if (!identities || identities.length === 0) {
    console.error(`❌ No identity found for ${targetEmail}`);
    return;
  }

  const identity = identities[0];
  console.log(`✅ Found identity: ${identity.id}`);

  // Update the password using the auth module
  await authModuleService.updateAuthIdentities({
    id: identity.id,
    provider_metadata: {
      password: newPassword,
    }
  });

  console.log(`✅ Password updated successfully for ${targetEmail}`);
  console.log(`   New bridge password matches Firebase UID.`);
}
