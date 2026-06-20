import { 
  Modules,
} from "@medusajs/framework/utils";

/**
 * Deletes the broken Medusa auth identity for unforgetable523566@gmail.com.
 * After this runs, Google Login will cleanly re-register the user.
 * Run: npx medusa exec src/scripts/delete-identity.ts
 */
export default async function deleteIdentity({ container }) {
  const authModuleService = container.resolve(Modules.AUTH);

  const IDENTITY_ID = "authid_01KPTYXPM1QAYAKE364521T2N8";
  const TARGET_EMAIL = "unforgetable523566@gmail.com";

  console.log(`\n🗑️  Deleting broken identity for: ${TARGET_EMAIL}`);
  console.log(`   Identity ID: ${IDENTITY_ID}`);

  await authModuleService.deleteAuthIdentities([IDENTITY_ID]);

  console.log(`✅ Successfully deleted identity.`);
  console.log(`\n   Next step: Click "Sign in with Google" on the login page.`);
  console.log(`   The user will be cleanly re-registered in Medusa.\n`);
}
