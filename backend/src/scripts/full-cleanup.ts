import { 
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";

/**
 * FULL DATA CLEANUP SCRIPT (AUTH + CUSTOMER)
 * ─────────────────────────────────────────────────────────────────
 * This script:
 * 1. Deletes all auth identities (except admin)
 * 2. Deletes all customer records (except admin-related if any)
 *
 * Run: npx medusa exec src/scripts/full-cleanup.ts
 */
export default async function fullCleanup({ container }) {
  const authModuleService = container.resolve(Modules.AUTH);
  const customerModuleService = container.resolve(Modules.CUSTOMER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const ADMIN_EMAILS = ["admin@admin.com"];

  // 1. Cleanup Auth Identities
  const { data: identities } = await query.graph({
    entity: "auth_identity",
    fields: ["id", "provider_identities.*"],
  });

  const authIdsToDelete: string[] = [];
  for (const identity of identities) {
    const emails = (identity.provider_identities || []).map(pi => pi.entity_id);
    const isAnyAdmin = emails.some(email => ADMIN_EMAILS.includes(email));

    if (!isAnyAdmin) {
      authIdsToDelete.push(identity.id);
    }
  }

  if (authIdsToDelete.length > 0) {
    await authModuleService.deleteAuthIdentities(authIdsToDelete);
    console.log(`✅ Deleted ${authIdsToDelete.length} auth identities.`);
  }

  // 2. Cleanup Customer Records
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
  });

  const customerIdsToDelete: string[] = [];
  for (const customer of customers) {
    if (!ADMIN_EMAILS.includes(customer.email)) {
      customerIdsToDelete.push(customer.id);
    }
  }

  if (customerIdsToDelete.length > 0) {
    await customerModuleService.deleteCustomers(customerIdsToDelete);
    console.log(`✅ Deleted ${customerIdsToDelete.length} customer records.`);
  }

  console.log(`\n✨ Database is now clean. You can now re-register with any email via Google Login.\n`);
}
