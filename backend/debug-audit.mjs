/**
 * Minimal debug script for inventory audit log.
 * Uses fetch() directly - no bash parsing issues.
 */

const BASE = "http://localhost:9000"

async function api(method, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

async function main() {
  console.log("═══ Minimal Inventory Audit Debug ═══\n")

  // 1. Admin login
  const r1 = await api("POST", "/auth/user/emailpass?returnAccessToken=true", {
    body: { email: "admin@admin.com", password: "TestAdmin123!" },
  })
  const adminToken = r1.body?.access_token || r1.body?.token
  console.log("1. Admin login:", adminToken ? "OK" : "FAIL")

  // 2. Register vendor
  const email = `debug-${uid()}@eatsie.test`
  const reg = await api("POST", "/vendor/register", {
    body: { name: "Debug", store_name: "Debug", email, password: "TestPass123!" },
  })
  const vendorId = reg.body?.vendor?.id
  console.log("2. Vendor registered:", vendorId)

  // 3. Approve
  await api("POST", `/admin/vendors/${vendorId}/approve`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  console.log("3. Approved")

  // 4. Login as vendor
  const login = await api("POST", "/vendor/login", {
    body: { email, password: "TestPass123!" },
  })
  const vendorToken = login.body?.token
  console.log("4. Vendor token:", vendorToken ? "OK" : "FAIL")

  // 5. Create product
  const prod = await api("POST", "/vendor/products", {
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: { title: `Debug ${uid()}`, price: 19.99 },
  })
  const productId = prod.body?.product?.id
  console.log("5. Product:", productId)

  // 6. Get inventory (before setup)
  let inv = await api("GET", "/vendor/inventory", {
    headers: { Authorization: `Bearer ${vendorToken}` },
  })
  console.log(`6. Inventory before setup: ${inv.body?.inventory?.length || 0} items`)

  // 7. Setup inventory via medusa exec
  console.log("7. Running setup-vendor-inventory...")
  const { execSync } = await import("child_process")
  try {
    const out = execSync("npx medusa exec ./src/scripts/setup-vendor-inventory.ts", {
      cwd: process.cwd(),
      shell: true,
      timeout: 30000,
      stdio: "pipe",
    })
    console.log("   Output:", out.toString().trim().split("\n").pop())
  } catch (e) {
    console.log("   Setup error:", e.message)
  }

  // 8. Get inventory (after setup)
  inv = await api("GET", "/vendor/inventory", {
    headers: { Authorization: `Bearer ${vendorToken}` },
  })
  const items = inv.body?.inventory || []
  console.log(`8. Inventory after setup: ${items.length} items`)

  if (items.length === 0) {
    console.log("   FATAL: No inventory to test with")
    return
  }

  const item = items[0]
  console.log(`   level_id: ${item.level_id}`)
  console.log(`   stocked_quantity: ${item.stocked_quantity}`)
  console.log(`   inventory_item_id: ${item.inventory_item_id}`)
  console.log(`   location_id: ${item.location_id}`)

  // 9. Update stock (increase)
  const newQty = item.stocked_quantity + 50
  console.log(`\n9. Updating stock ${item.stocked_quantity} -> ${newQty}...`)
  const update = await api("POST", "/vendor/inventory", {
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: { level_id: item.level_id, stocked_quantity: newQty },
  })
  console.log(`   Status: ${update.status}`)
  console.log(`   Response: ${JSON.stringify(update.body, null, 2)}`)

  // 10. Update stock (decrease)
  const lowerQty = newQty - 10
  console.log(`\n10. Updating stock ${newQty} -> ${lowerQty}...`)
  const update2 = await api("POST", "/vendor/inventory", {
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: { level_id: item.level_id, stocked_quantity: lowerQty },
  })
  console.log(`   Status: ${update2.status}`)
  console.log(`   Response: ${JSON.stringify(update2.body, null, 2)}`)

  // 11. Check audit log
  console.log("\n11. Checking audit log...")
  const audit = await api("GET", "/vendor/inventory/audit", {
    headers: { Authorization: `Bearer ${vendorToken}` },
  })
  console.log(`   Status: ${audit.status}`)
  console.log(`   Entries: ${audit.body?.entries?.length || 0}`)
  if (audit.body?.entries?.length > 0) {
    console.log(`   First entry: ${JSON.stringify(audit.body.entries[0], null, 2)}`)
  } else {
    console.log("   Full response:", JSON.stringify(audit.body))
  }

  // 12. Admin audit overview
  console.log("\n12. Admin audit overview...")
  const adminAudit = await api("GET", "/admin/inventory-audit", {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  console.log(`   Status: ${adminAudit.status}`)
  console.log(`   Entries: ${adminAudit.body?.entries?.length || 0}`)
}

main().catch(e => {
  console.error("FATAL:", e)
  process.exit(1)
})
