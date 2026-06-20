import { 
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";

/**
 * Searches for any auth identity by email and lists all its details.
 * Run: npx medusa exec src/scripts/debug-email.ts
 */
export default async function debugEmail({ container }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const targetEmail = "24amtics601@gmail.com";

  console.log(`\n🔍 Searching for ALL identities related to: ${targetEmail}`);

  const { data: identities } = await query.graph({
    entity: "auth_identity",
    fields: ["id", "provider_identities.*"],
  });

  const matches = identities.filter(id => 
    id.provider_identities?.some(pi => pi.entity_id === targetEmail)
  );

  if (matches.length === 0) {
    console.log(`✅ No identities found for ${targetEmail} in the database.`);
  } else {
    console.log(`❌ Found ${matches.length} matching identities:`);
    matches.forEach(m => {
      console.log(`- ID: ${m.id}`);
      m.provider_identities.forEach(pi => {
        console.log(`  Provider: ${pi.provider}, EntityID: ${pi.entity_id}`);
      });
    });
  }

  console.log(`\n🔍 Searching for customers with email: ${targetEmail}`);
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { email: targetEmail }
  });

  if (customers.length === 0) {
    console.log(`✅ No customers found for ${targetEmail}.`);
  } else {
    console.log(`❌ Found ${customers.length} customers:`);
    customers.forEach(c => console.log(`- ID: ${c.id}, Email: ${c.email}`));
  }
}
