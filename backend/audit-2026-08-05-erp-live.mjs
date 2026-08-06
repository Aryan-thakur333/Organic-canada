/**
 * Audit 2026-08-05: Live ERP verification (read-only + dry-run first).
 * Admin login -> status -> products lookup -> product sync dry-run -> inventory sync dry-run.
 * NO real writes are performed here (sync dry-runs are env-gated anyway).
 */
const BASE = "http://localhost:9000"

async function api(method, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text.slice(0, 500) }
  return { status: res.status, body }
}

async function main() {
  console.log("═══ AUDIT: LIVE ERP VERIFICATION ═══\n")

  // 1. Admin login
  const r1 = await api("POST", "/auth/user/emailpass?returnAccessToken=true", {
    body: { email: "admin@eatsie.com", password: process.env.AUDIT_ADMIN_PASSWORD || "123456" },
  })
  const adminToken = r1.body?.access_token || r1.body?.token
  console.log("1. Admin login:", adminToken ? "OK" : `FAIL (${r1.status})`)
  if (!adminToken) return
  const auth = { Authorization: `Bearer ${adminToken}` }

  // 2. ERP status
  const status = await api("GET", "/admin/erp/status", { headers: auth })
  console.log("\n2. /admin/erp/status:", status.status)
  console.log(JSON.stringify(status.body, null, 2))

  // 3. Product lookup
  const products = await api("GET", "/admin/erp/products?sku=ERP-SHIRT-S-BLACK", { headers: auth })
  console.log("\n3. /admin/erp/products?sku=ERP-SHIRT-S-BLACK:", products.status)
  const prodBody = products.body
  if (prodBody && Array.isArray(prodBody.products)) {
    console.log("   count =", prodBody.products.length)
    console.log(JSON.stringify(prodBody.products.map(p => ({ id: p.id, name: p.name, default_code: p.default_code, list_price: p.list_price, active: p.active })), null, 2))
  } else {
    console.log(JSON.stringify(prodBody, null, 2))
  }

  // 4. Product sync dry-run (idempotency probe #1)
  const sync1 = await api("POST", "/admin/erp/products/sync", {
    headers: auth,
    body: { sku: "ERP-SHIRT-S-BLACK", direction: "medusa_to_odoo" },
  })
  console.log("\n4. POST /admin/erp/products/sync (dry-run #1):", sync1.status)
  console.log(JSON.stringify(sync1.body, null, 2))

  // 5. Product sync dry-run (idempotency probe #2 — expect SKIP/NO_CHANGES)
  const sync2 = await api("POST", "/admin/erp/products/sync", {
    headers: auth,
    body: { sku: "ERP-SHIRT-S-BLACK", direction: "medusa_to_odoo" },
  })
  console.log("\n5. POST /admin/erp/products/sync (dry-run #2):", sync2.status)
  console.log(JSON.stringify(sync2.body, null, 2))

  // 6. Inventory sync dry-run
  const inv = await api("POST", "/admin/erp/inventory/sync", {
    headers: auth,
    body: { sku: "ERP-SHIRT-S-BLACK" },
  })
  console.log("\n6. POST /admin/erp/inventory/sync (dry-run):", inv.status)
  console.log(JSON.stringify(inv.body, null, 2))

  console.log("\n═══ END ═══")
}

main().catch((e) => { console.error(e); process.exit(1) })
