/**
 * Audit 2026-08-05: POS search / barcode / session verification (read-only).
 * Known SKU: SHIRT-S-BLACK. Register: Canada (CA) 01KYMKWP9FAB13SGT4Z5XTW6R2, USA 01KYMKWP9T4YWNMZA47AZNQSY3.
 */
const BASE = "http://localhost:9000"
const CA = "01KYMKWP9FAB13SGT4Z5XTW6R2"
const US = "01KYMKWP9T4YWNMZA47AZNQSY3"

async function api(method, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text.slice(0, 300) }
  return { status: res.status, body }
}

const brief = (o) => JSON.stringify(o)?.slice(0, 700)

async function main() {
  console.log("═══ AUDIT: POS SEARCH / BARCODE / SESSION ═══\n")
  const login = await api("POST", "/auth/user/emailpass?returnAccessToken=true", {
    body: { email: "admin@eatsie.com", password: "123456" },
  })
  const token = login.body?.access_token || login.body?.token
  if (!token) { console.log("LOGIN FAIL", login.status); return }
  const auth = { Authorization: `Bearer ${token}` }

  // 1. Search by SKU
  const s1 = await api("GET", `/pos/products/search?q=SHIRT-S-BLACK&register_id=${CA}`, { headers: auth })
  console.log("1. search by SKU 'SHIRT-S-BLACK':", s1.status)
  const s1b = s1.body
  console.log("   count:", s1b?.products?.length ?? s1b?.count, "first:", s1b?.products?.[0] ? { id: s1b.products[0].id, sku: s1b.products[0].sku, title: s1b.products[0].title } : brief(s1b))

  // 2. Search by title
  const s2 = await api("GET", `/pos/products/search?q=Shirt&register_id=${CA}`, { headers: auth })
  console.log("2. search by title 'Shirt':", s2.status, "count:", s2.body?.products?.length ?? s2.body?.count)

  // 3. Lookup by barcode (try known barcode from variant)
  const v = await api("GET", `/pos/products/search?q=SHIRT-S-BLACK&register_id=${CA}`, { headers: auth })
  const variant = v.body?.products?.[0]?.variants?.[0] || v.body?.products?.[0]
  const sku = variant?.sku || "SHIRT-S-BLACK"
  const barcode = variant?.barcode || null
  console.log("3. variant sku:", sku, "barcode:", barcode)

  // 4. Scan by SKU (manual fallback path)
  const scan = await api("POST", "/pos/scan", { headers: auth, body: { code: sku, register_id: CA } })
  console.log("4. POST /pos/scan (SKU):", scan.status)
  if (scan.body?.data) console.log("   ", brief({ found: scan.body.data.found ?? scan.body.data.product, code: scan.body.data.code }))
  else console.log("   ", brief(scan.body))

  // 5. Scan unknown barcode -> expect POS_PRODUCT_NOT_FOUND classification
  const scanBad = await api("POST", "/pos/scan", { headers: auth, body: { code: "NO-SUCH-BARCODE-999", register_id: CA } })
  console.log("5. scan unknown:", scanBad.status, brief(scanBad.body))

  // 6. Lookup with missing register -> expect POS_REGISTER_ID_MISSING
  const lookupNoReg = await api("GET", "/pos/products/lookup?code=SHIRT-S-BLACK", { headers: auth })
  console.log("6. lookup without register_id:", lookupNoReg.status, brief(lookupNoReg.body))

  // 7. Inventory for SHIRT-S-BLACK at register location
  const inv = await api("GET", `/pos/inventory/${sku}?register_id=${CA}`, { headers: auth })
  console.log("7. inventory", sku, ":", inv.status, brief(inv.body))

  // 8. Session endpoints
  const meSession = await api("GET", "/pos/me/session", { headers: auth })
  console.log("8. GET /pos/me/session:", meSession.status, brief(meSession.body))
  const regSession = await api("GET", `/pos/registers/${CA}/session`, { headers: auth })
  console.log("9. GET /pos/registers/:id/session:", regSession.status, brief(regSession.body))

  // 10. Session open check (read-only existing session state)
  const sessionOpen = await api("POST", "/pos/registers/" + CA + "/open", { headers: auth, body: {} })
  console.log("10. POST registers/:id/open (idempotent probe):", sessionOpen.status, brief(sessionOpen.body))

  console.log("\n═══ END ═══")
}

main().catch((e) => { console.error(e); process.exit(1) })
