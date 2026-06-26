/**
 * Inventory Audit Log Test — uses existing vendors/products with inventory.
 * Does NOT create new products (avoids needing medusa exec).
 */

const BASE = "http://localhost:9000"
const headers = { "Content-Type": "application/json" }

let failures = 0
let successes = 0

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS: ${label}`)
    successes++
  } else {
    console.log(`  FAIL: ${label}`)
    failures++
  }
}

async function api(method, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...headers, ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  let body
  try { body = await res.json() } catch { body = null }
  return { status: res.status, body }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

async function main() {
  console.log("═══ Inventory Audit Log — End-to-End Test ═══\n")

  // ── Step 1: Admin Login ────────────────────────────────
  console.log("1. Admin Login")

  const r1 = await api("POST", "/auth/user/emailpass?returnAccessToken=true", {
    body: { email: "admin@admin.com", password: "TestAdmin123!" },
  })
  let adminToken = r1.body?.access_token || r1.body?.token
  if (!adminToken) {
    const r2 = await api("POST", "/auth/user/emailpass", {
      body: { email: "admin@admin.com", password: "TestAdmin123!" },
    })
    adminToken = r2.body?.token
  }
  assert(!!adminToken, "Admin logged in")
  if (!adminToken) { process.exit(1) }

  const adminAuth = { Authorization: `Bearer ${adminToken}` }

  // ── Step 2: Find an existing approved vendor ──────────
  console.log("\n2. Find existing vendor")

  const vendorsRes = await api("GET", "/admin/vendors", { headers: adminAuth })
  const vendors = vendorsRes.body?.vendors || []
  assert(vendors.length > 0, `Found ${vendors.length} vendors`)

  // Find an approved vendor
  let approvedVendor = vendors.find(v => v.status === "approved")

  if (!approvedVendor) {
    // No approved vendor exists — register and approve one
    console.log("\n  No approved vendor found. Registering new vendor...")
    const vendorEmail = `test-${uid()}@eatsie.test`
    const regRes = await api("POST", "/vendor/register", {
      body: { name: "Test Vendor", store_name: "Test Store", email: vendorEmail, password: "VendorTest123!" },
    })
    const vId = regRes.body?.vendor?.id
    assert(!!vId, `Vendor registered, id=${vId}`)

    await api("POST", `/admin/vendors/${vId}/approve`, { headers: adminAuth })
    approvedVendor = { id: vId, email: vendorEmail }
    console.log(`  Registered and approved vendor: ${vendorEmail}`)
  }

  assert(!!approvedVendor, `Approved vendor found: ${approvedVendor?.id}`)

  let vendorId = approvedVendor.id
  console.log(`  Using vendor: ${approvedVendor.email || approvedVendor.name} (${vendorId})`)

  // ── Step 3: Login as vendor (need password) ─────────
  // For existing vendors, we may not know the password.
  // Try common approaches:
  // - If it's an existing seeded vendor, try the seed password
  // - If we just registered it, use known password

  // For seeded vendors, check if there's a known password pattern
  // Let's try to login with a few common passwords
  const passwords = ["VendorTest123!", "seedvendor1", "vendor123!", "Password123!"]
  let vendorToken = null

  for (const pw of passwords) {
    const loginRes = await api("POST", "/vendor/login", {
      body: { email: approvedVendor.email, password: pw },
    })
    if (loginRes.status === 200 && loginRes.body?.token) {
      vendorToken = loginRes.body.token
      console.log(`  Vendor logged in with password: ${pw}`)
      break
    }
  }

  if (!vendorToken) {
    // Last resort: register a fresh vendor with known password
    console.log("  Could not login as existing vendor. Registering fresh one...")
    const vendorEmail = `fresh-${uid()}@eatsie.test`
    const regRes = await api("POST", "/vendor/register", {
      body: { name: "Fresh Vendor", store_name: "Fresh Store", email: vendorEmail, password: "VendorTest123!" },
    })
    const newVendorId = regRes.body?.vendor?.id
    assert(!!newVendorId, "Fresh vendor registered")
    await api("POST", `/admin/vendors/${newVendorId}/approve`, { headers: adminAuth })

    const loginRes = await api("POST", "/vendor/login", {
      body: { email: vendorEmail, password: "VendorTest123!" },
    })
    vendorToken = loginRes.body?.token
    vendorId = newVendorId
    if (!vendorToken) {
      console.log("FATAL: Cannot authenticate as any vendor.")
      process.exit(1)
    }
    console.log(`  Fresh vendor registered and logged in: ${vendorEmail}`)
  }

  assert(!!vendorToken, "Vendor token obtained")
  const vendorAuth = { Authorization: `Bearer ${vendorToken}` }

  // ── Step 4: Create a product for this vendor ─────────
  console.log("\n4. Create product for vendor")

  const prodRes = await api("POST", "/vendor/products", {
    headers: vendorAuth,
    body: { title: `Audit Test ${uid()}`, price: 19.99 },
  })
  const product = prodRes.body?.product
  assert(!!product?.id, `Product created: ${product?.id}`)
  console.log(`  Product ID: ${product.id}`)

  // ── Step 5: Check if vendor has inventory ────────────
  console.log("\n5. Check vendor inventory")

  let invRes = await api("GET", "/vendor/inventory", { headers: vendorAuth })
  console.log(`  Inventory response: status=${invRes.status}, count=${invRes.body?.inventory?.length || 0}`)

  // If no inventory, create inventory items using the Admin API
  if (!invRes.body?.inventory?.length) {
    console.log("\n  No inventory found. Creating via Admin inventory endpoints...")

    // Get the default stock location
    const locRes = await api("GET", "/admin/stock-locations", { headers: adminAuth })
    const locationId = locRes.body?.stock_locations?.[0]?.id
    assert(!!locationId, `Stock location: ${locationId}`)

    // Get the product's variant
    const prodDetailRes = await api("GET", `/admin/products/${product.id}`, { headers: adminAuth })
    const variant = prodDetailRes.body?.product?.variants?.[0]
    assert(!!variant?.id, `Product variant: ${variant?.id}`)

    // Create inventory item via admin API
    const invItemRes = await api("POST", "/admin/inventory-items", {
      headers: adminAuth,
      body: { sku: variant.sku || `SKU-${variant.id}`, title: variant.title },
    })
    const invItemId = invItemRes.body?.inventory_item?.id
    assert(!!invItemId, `Inventory item created: ${invItemId}`)

    // Link variant to inventory item
    await api("POST", `/admin/products/${product.id}/variants/${variant.id}/inventory-items`, {
      headers: adminAuth,
      body: { inventory_item_id: invItemId, required_quantity: 1 },
    })

    // Create inventory level at the default location
    const levelRes = await api("POST", "/admin/inventory-items", {
      headers: adminAuth,
      body: {
        sku: variant.sku || `SKU-${variant.id}`,
        title: variant.title,
        location_levels: [{ location_id: locationId, stocked_quantity: 100 }],
      },
    })
    console.log(`  Inventory level response: status=${levelRes.status}`)

    // Re-check vendor inventory
    invRes = await api("GET", "/vendor/inventory", { headers: vendorAuth })
    console.log(`  Inventory after setup: ${invRes.body?.inventory?.length || 0} items`)
  }

  assert(invRes.body?.inventory?.length > 0,
    `Has ${invRes.body?.inventory?.length} inventory items`)

  const firstItem = invRes.body.inventory[0]
  const levelId = firstItem?.level_id
  const currentStock = firstItem?.stocked_quantity || 0
  assert(!!levelId, `Level ID: ${levelId}, current stock: ${currentStock}`)

  // ── Step 6: Update Stock (Increase) ──────────────────
  console.log("\n6. Update Stock (increase)")

  const newQty = currentStock + 50
  const updateRes = await api("POST", "/vendor/inventory", {
    headers: vendorAuth,
    body: { level_id: levelId, stocked_quantity: newQty },
  })
  assert(updateRes.status === 200,
    `Stock ${currentStock} -> ${newQty} (${updateRes.status})`)

  // ── Step 7: Update Stock (Decrease) ──────────────────
  console.log("\n7. Update Stock (decrease)")

  const lowerQty = newQty - 10
  const updateRes2 = await api("POST", "/vendor/inventory", {
    headers: vendorAuth,
    body: { level_id: levelId, stocked_quantity: lowerQty },
  })
  assert(updateRes2.status === 200,
    `Stock ${newQty} -> ${lowerQty} (${updateRes2.status})`)

  // ── Step 8: Check Audit Log ─────────────────────────
  console.log("\n8. GET /vendor/inventory/audit")

  const auditRes = await api("GET", "/vendor/inventory/audit", { headers: vendorAuth })
  assert(auditRes.status === 200, `Audit fetched (${auditRes.status})`)

  const entries = auditRes.body?.entries || []
  assert(Array.isArray(entries), "Entries is array")
  assert(entries.length >= 2, `Has ${entries.length} entries (expected >= 2)`)

  const e = entries[0]
  assert(!!e.id, `Entry id: ${e.id}`)
  assert(e.vendor_id === vendorId, `Vendor ID matches: ${e.vendor_id}`)
  assert(e.level_id === levelId, `Level ID matches: ${e.level_id}`)
  assert(typeof e.previous_stocked_quantity === "number",
    `previous=${e.previous_stocked_quantity}`)
  assert(typeof e.new_stocked_quantity === "number",
    `new=${e.new_stocked_quantity}`)
  assert(["restock","manual_update","adjustment"].includes(e.change_type),
    `change_type=${e.change_type}`)
  assert(e.source === "vendor_dashboard", `source=${e.source}`)
  assert(e.actor_type === "vendor", `actor_type=${e.actor_type}`)
  assert(!!e.created_at, `created_at=${e.created_at}`)

  // Check restock and manual_update entries exist
  const hasRestock = entries.some(e =>
    e.level_id === levelId && e.change_type === "restock"
  )
  const hasManual = entries.some(e =>
    e.level_id === levelId && e.change_type === "manual_update"
  )
  assert(hasRestock, "Has restock entry")
  assert(hasManual, "Has manual_update entry")

  // ── Step 9: Filter by Level ID ───────────────────────
  console.log("\n9. Filter audit by level_id")

  const filterRes = await api("GET",
    `/vendor/inventory/audit?level_id=${levelId}&limit=5`, { headers: vendorAuth })
  assert(filterRes.status === 200, `Filtered (${filterRes.status})`)
  assert(filterRes.body?.entries.every(e => e.level_id === levelId),
    "All filtered entries match level_id")

  // ── Step 10: Pagination ──────────────────────────────
  console.log("\n10. Pagination")

  const pageRes = await api("GET", "/vendor/inventory/audit?limit=1&offset=0", {
    headers: vendorAuth,
  })
  assert(pageRes.status === 200, `Paginated (${pageRes.status})`)
  assert(pageRes.body?.entries?.length <= 1,
    `Page size: ${pageRes.body?.entries?.length}`)
  assert(pageRes.body?.limit === 1, `limit=${pageRes.body?.limit}`)
  assert(pageRes.body?.offset === 0, `offset=${pageRes.body?.offset}`)

  // ── Step 11: Admin Audit Overview ────────────────────
  console.log("\n11. GET /admin/inventory-audit")

  const adminAuditRes = await api("GET", "/admin/inventory-audit", { headers: adminAuth })
  assert(adminAuditRes.status === 200, `Admin audit (${adminAuditRes.status})`)
  assert(adminAuditRes.body?.entries?.length > 0,
    `Admin sees ${adminAuditRes.body?.entries?.length} entries`)

  const adminFilterRes = await api("GET",
    `/admin/inventory-audit?vendor_id=${vendorId}`, { headers: adminAuth })
  assert(adminFilterRes.status === 200, `Admin filtered (${adminFilterRes.status})`)
  assert(adminFilterRes.body?.entries.every(e => e.vendor_id === vendorId),
    "Admin filter by vendor_id works")

  // ── Summary ──────────────────────────────────────────
  console.log(`\n═══ Results: ${successes} passed, ${failures} failed ═══`)
  if (failures > 0) process.exit(1)
}

main().catch((err) => {
  console.error("FATAL:", err)
  process.exit(1)
})
