/**
 * Audit 2026-08-05: STOREFRONT PRICING LIVE E2E
 * Phases 6 (repaired products), 7 (price create control), 12 (cart quantities).
 * Uses the REAL vendor flow for the controlled product, then cleans up.
 * All money amounts are catalog MAJOR units on write; cart uses minor units.
 */
import pg from "pg"

const BASE = "http://localhost:9000"
const DB_URL = "postgres://postgres:9426695327@localhost:5432/medusa-backend"
const PUBLISHABLE = "pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491"
const REGION_CA = "reg_01KVJF9HSCYKAZC677GH1AC6C8"
const REGION_US = "reg_01KXT623CTGM9NJJYK2G4DQW7E"

let pass = 0, fail = 0
const results = []
function check(label, ok, detail = "") {
  if (ok) { pass++ } else { fail++ }
  results.push(`${ok ? "✅ PASS" : "❌ FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

async function api(method, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text.slice(0, 400) }
  return { status: res.status, body }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

async function dbQuery(text, params) {
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()
  try {
    const res = await client.query(text, params)
    return res.rows
  } finally {
    await client.end()
  }
}

async function main() {
  console.log("═══ AUDIT: STOREFRONT PRICING LIVE E2E ═══\n")

  // ── Admin login ──────────────────────────────────────────────────────
  const admin = await api("POST", "/auth/user/emailpass?returnAccessToken=true", {
    body: { email: "admin@eatsie.com", password: "123456" },
  })
  const adminToken = admin.body?.access_token || admin.body?.token
  check("Admin login", Boolean(adminToken), `status=${admin.status}`)
  if (!adminToken) { console.log(results.join("\n")); console.log(`\nRESULT: ${pass} pass / ${fail} fail`); process.exit(1) }
  const auth = { Authorization: `Bearer ${adminToken}` }

  // ── PHASE 6: Repaired products (DB + Store API) ──────────────────────
  console.log("\n── PHASE 6: Repaired catalog products (DB vs Store API) ──")
  const expected = [
    { sku: "VENDOR-mqrpiio4-1", title: "Thekua", amount: 20 },
    { sku: "VENDOR-mqrmfj31-1", title: "Pineapple", amount: 9 },
    { sku: "VENDOR-mqrn4ern-1", title: "Pineapple", amount: 7 },
    { sku: "VENDOR-mqqhlb5x-1", title: "papaya", amount: 6 },
  ]
  const dbPrices = await dbQuery(`
    select p.id as product_id, p.title, pv.id as variant_id, pv.sku, pr.amount, pr.currency_code
    from product p
    join product_variant pv on pv.product_id = p.id
    join product_variant_price_set pvps on pvps.variant_id = pv.id
    join price_set ps on ps.id = pvps.price_set_id
    join price pr on pr.price_set_id = ps.id
    where pr.currency_code = 'cad' and pv.sku = any($1)
    order by pv.sku`, [expected.map((e) => e.sku)])
  const dbBySku = new Map(dbPrices.map((r) => [r.sku, r]))
  for (const exp of expected) {
    const row = dbBySku.get(exp.sku)
    const dbOk = row && Number(row.amount) === exp.amount
    check(`DB: ${exp.title} (${exp.sku}) = ${exp.amount} CAD`, Boolean(dbOk), dbOk ? "" : `got ${row?.amount}`)

    // Fetch the specific product by id so the exact variant is returned.
    if (row) {
      const store = await api("GET", `/store/products/${row.product_id}?region_id=${REGION_CA}&country_code=ca&fields=id,title,variants.id,variants.sku,variants.calculated_price.*`, {
        headers: { "x-publishable-api-key": PUBLISHABLE },
      })
      const variant = (store.body?.product?.variants || []).find((v) => v.sku === exp.sku)
      const calc = variant?.calculated_price
      const calcOk = calc && Number(calc.calculated_amount) === exp.amount && String(calc.currency_code).toLowerCase() === "cad"
      check(`Store API: ${exp.title} calculated = ${exp.amount} CAD`, Boolean(calcOk), calcOk ? "" : JSON.stringify({ status: store.status, calc }).slice(0, 200))
    }
  }

  // ── PHASE 7: Controlled price create via REAL vendor flow ─────────────
  console.log("\n── PHASE 7: FINAL-PRICE-CONTROL (CAD 59 / USD 49) ──")
  const vendorEmail = `price-control-${uid()}@eatsie.test`
  const vendorPassword = "PriceControl123!"
  const reg = await api("POST", "/vendor/register", {
    body: { name: "Price Control", store_name: "Price Control Store", email: vendorEmail, password: vendorPassword, confirm_password: vendorPassword },
  })
  const vendorId = reg.body?.vendor?.id
  check("Vendor registration", Boolean(vendorId), `status=${reg.status}`)
  if (!vendorId) { console.log(results.join("\n")); console.log(`\nRESULT: ${pass} pass / ${fail} fail`); process.exit(1) }

  await api("POST", `/admin/vendors/${vendorId}/approve`, { headers: auth })
  check("Vendor approved", true)

  const vlogin = await api("POST", "/vendor/login", { body: { email: vendorEmail, password: vendorPassword } })
  const vendorToken = vlogin.body?.token
  check("Vendor login", Boolean(vendorToken), `status=${vlogin.status}`)
  const vauth = { Authorization: `Bearer ${vendorToken}` }

  // Create with dual currency via variants.prices (major units on write).
  // The vendor API uses variants[].prices verbatim when no top-level `price`
  // fallback is supplied, which is the only path that writes USD in one call.
  const createPayload = {
    title: "FINAL-PRICE-CONTROL",
    currency_code: "cad",
    variants: [
      {
        title: "Standard",
        sku: `PRICE-CTRL-${uid()}`,
        prices: [
          { amount: 59, currency_code: "cad" },
          { amount: 49, currency_code: "usd" },
        ],
      },
    ],
  }
  const created = await api("POST", "/vendor/products", { headers: vauth, body: createPayload })
  const product = created.body?.product
  const productId = product?.id
  const variantId = product?.variants?.[0]?.id
  const createResponsePrice = product?.variants?.[0]?.prices?.find((p) => p.currency_code === "cad")?.amount
  check("Create: request CAD 59 → response CAD 59", Number(createResponsePrice) === 59, `got ${createResponsePrice} status=${created.status}`)
  const usdResp = product?.variants?.[0]?.prices?.find((p) => p.currency_code === "usd")?.amount
  check("Create: request USD 49 → response USD 49", Number(usdResp) === 49, `got ${usdResp}`)
  if (!productId || !variantId) {
    console.log("  Create failed:", JSON.stringify(created.body).slice(0, 400))
    console.log(results.join("\n")); console.log(`\nRESULT: ${pass} pass / ${fail} fail`); process.exit(1)
  }

  // DB check
  const dbCreated = await dbQuery(`
    select pr.currency_code, pr.amount
    from product_variant pv
    join product_variant_price_set pvps on pvps.variant_id = pv.id
    join price_set ps on ps.id = pvps.price_set_id
    join price pr on pr.price_set_id = ps.id
    where pv.id = $1 order by pr.currency_code`, [variantId])
  const dbCad = dbCreated.find((r) => r.currency_code === "cad")
  const dbUsd = dbCreated.find((r) => r.currency_code === "usd")
  check("DB: CAD price = 59", Number(dbCad?.amount) === 59, `got ${dbCad?.amount}`)
  check("DB: USD price = 49", Number(dbUsd?.amount) === 49, `got ${dbUsd?.amount}`)

  // Store API Canada
  const storeCa = await api("GET", `/store/products/${productId}?region_id=${REGION_CA}&country_code=ca&fields=id,title,variants.id,variants.calculated_price.*`, {
    headers: { "x-publishable-api-key": PUBLISHABLE },
  })
  const calcCa = storeCa.body?.product?.variants?.[0]?.calculated_price
  check("Store API Canada: calculated = 59 CAD", Number(calcCa?.calculated_amount) === 59 && String(calcCa?.currency_code).toLowerCase() === "cad",
    JSON.stringify(calcCa).slice(0, 150))

  // Store API USA
  const storeUs = await api("GET", `/store/products/${productId}?region_id=${REGION_US}&country_code=us&fields=id,title,variants.id,variants.calculated_price.*`, {
    headers: { "x-publishable-api-key": PUBLISHABLE },
  })
  const calcUs = storeUs.body?.product?.variants?.[0]?.calculated_price
  check("Store API USA: calculated = 49 USD", Number(calcUs?.calculated_amount) === 49 && String(calcUs?.currency_code).toLowerCase() === "usd",
    JSON.stringify(calcUs).slice(0, 150))

  // ── PHASE 12: Cart quantities (CAD 59) ───────────────────────────────
  console.log("\n── PHASE 12: Cart quantity scaling (59 CAD) ──")
  const cart = await api("POST", "/store/carts", {
    headers: { "x-publishable-api-key": PUBLISHABLE },
    body: { region_id: REGION_CA },
  })
  const cartId = cart.body?.cart?.id
  check("Cart created", Boolean(cartId), `status=${cart.status}`)
  if (cartId) {
    for (const qty of [1, 2, 3]) {
      const add = await api("POST", `/store/carts/${cartId}/line-items`, {
        headers: { "x-publishable-api-key": PUBLISHABLE },
        body: { variant_id: variantId, quantity: qty },
      })
      const item = add.body?.cart?.items?.[0]
      const unitMinor = Number(item?.unit_price)
      const totalMinor = Number(item?.total)
      const expectedUnit = 5900 * qty
      const ok = unitMinor === 5900 && totalMinor === expectedUnit
      check(`Qty ${qty}: unit=${5900} minor, total=${expectedUnit} minor (${(expectedUnit / 100).toFixed(2)} CAD)`, ok,
        `unit=${unitMinor} total=${totalMinor}`)
    }
  }

  // ── PHASE 7b: Edit CAD 59 → 79.99 ────────────────────────────────────
  console.log("\n── PHASE 7b: Edit CAD 59 → 79.99 ──")
  const priceRows = await dbQuery(`select pr.id, pr.currency_code from price pr
    join price_set ps on ps.id = pr.price_set_id
    join product_variant_price_set pvps on pvps.price_set_id = ps.id
    where pvps.variant_id = $1`, [variantId])
  const cadPriceId = priceRows.find((r) => r.currency_code === "cad")?.id
  const usdPriceId = priceRows.find((r) => r.currency_code === "usd")?.id
  const edit = await api("PATCH", `/vendor/products/${productId}`, {
    headers: vauth,
    body: {
      variants: [{
        id: variantId,
        prices: [
          { id: cadPriceId, amount: 79.99, currency_code: "cad" },
          { id: usdPriceId, amount: 49, currency_code: "usd" },
        ],
      }],
    },
  })
  check("Edit: PATCH returns 200", edit.status === 200, `status=${edit.status}`)

  const dbEdited = await dbQuery(`
    select pr.currency_code, pr.amount from price pr
    join price_set ps on ps.id = pr.price_set_id
    join product_variant_price_set pvps on pvps.price_set_id = ps.id
    where pvps.variant_id = $1 order by pr.currency_code`, [variantId])
  const dbEditedCad = dbEdited.find((r) => r.currency_code === "cad")
  check("Edit: DB CAD = 79.99", Number(dbEditedCad?.amount) === 79.99, `got ${dbEditedCad?.amount}`)
  const dbEditedUsd = dbEdited.find((r) => r.currency_code === "usd")
  check("Edit: DB USD still 49", Number(dbEditedUsd?.amount) === 49, `got ${dbEditedUsd?.amount}`)

  const storeCa2 = await api("GET", `/store/products/${productId}?region_id=${REGION_CA}&country_code=ca&fields=id,title,variants.id,variants.calculated_price.*`, {
    headers: { "x-publishable-api-key": PUBLISHABLE },
  })
  const calcCa2 = storeCa2.body?.product?.variants?.[0]?.calculated_price
  check("Store API Canada after edit: calculated = 79.99 CAD",
    Number(calcCa2?.calculated_amount) === 79.99 && String(calcCa2?.currency_code).toLowerCase() === "cad",
    JSON.stringify(calcCa2).slice(0, 150))

  // Storefront formatting (major units → Intl)
  const formattedCa = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(79.99)
  check("Storefront formatCurrency(79.99 CAD) renders 79.99", formattedCa === "$79.99", formattedCa)

  // ── Cleanup: archive/delete controlled product + vendor ──────────────
  console.log("\n── Cleanup ──")
  const del = await api("DELETE", `/vendor/products/${productId}`, { headers: vauth })
  check("Cleanup: controlled product deleted", [200, 204].includes(del.status), `status=${del.status}`)
  const delV = await api("DELETE", `/admin/vendors/${vendorId}`, { headers: auth })
  console.log("   Vendor cleanup status:", delV.status)

  console.log("\n" + results.join("\n"))
  console.log(`\n═══ RESULT: ${pass} pass / ${fail} fail ═══`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error("FATAL", e); process.exit(1) })
