/**
 * Audit 2026-08-05: POS sales-channel policy enforcement test.
 * SHIRT-S-BLACK (variant_01KVJF9J7R77RDQYMEDJ0MF7TV) is NOT in the POS sales channel
 * (sc_01KWSKACE7DEGMXG6GH1ZRSA4V). Scan blocks it with POS_VARIANT_NOT_IN_SALES_CHANNEL.
 * This test verifies the cart/checkout path enforces the same policy.
 */
const BASE = "http://localhost:9000"
const CA = "01KYMKWP9FAB13SGT4Z5XTW6R2"
const OUT_OF_CHANNEL_VARIANT = "variant_01KVJF9J7R77RDQYMEDJ0MF7TV" // Medusa T-Shirt, channel sc_01KVJF9HK0YY92JES8P7VPZN12

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

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

async function main() {
  console.log("═══ AUDIT: POS SALES CHANNEL POLICY TEST ═══\n")
  const login = await api("POST", "/auth/user/emailpass?returnAccessToken=true", {
    body: { email: "admin@eatsie.com", password: "123456" },
  })
  const token = login.body?.access_token || login.body?.token
  if (!token) { console.log("LOGIN FAIL", login.status); return }
  const auth = { Authorization: `Bearer ${token}` }

  const clientUuid = `audit-channel-${uid()}`
  const idem = `audit-channel-${uid()}`

  // 1. Create cart
  const cart = await api("POST", "/pos/carts", { headers: auth, body: { register_id: CA, client_uuid: clientUuid, idempotency_key: idem } })
  console.log("1. create cart:", cart.status)
  const cartId = cart.body?.cart?.id
  if (!cartId) { console.log(JSON.stringify(cart.body).slice(0, 300)); return }
  console.log("   cart_id:", cartId)

  // 2. Add out-of-channel item
  const add = await api("POST", `/pos/carts/${cartId}`, {
    headers: auth,
    body: { items: [{ variant_id: OUT_OF_CHANNEL_VARIANT, quantity: 1 }], guest_email: `audit-${uid()}@pos.eatsie.local` },
  })
  console.log("2. add out-of-channel item:", add.status, add.body?.cart?.payload?.items?.length ? "item stored in payload" : JSON.stringify(add.body).slice(0, 200))

  // 3. Checkout attempt
  const pay = { method: "CARD_MANUAL", amount_minor: 0, terminal_reference: "AUDIT-TERM", authorization_reference: `AUDIT-${uid()}` }
  const c1 = await api("POST", `/pos/carts/${cartId}/checkout`, {
    headers: auth,
    body: { idempotency_key: idem, payments: [pay], guest_email: `audit-${uid()}@pos.eatsie.local` },
  })
  console.log("3. checkout attempt #1:", c1.status)
  const b1 = c1.body
  if (c1.status === 409 && b1?.code === "POS_TOTAL_CHANGED") {
    const total = b1?.native_cart?.total_minor
    console.log("   POS_TOTAL_CHANGED (expected - total unknown), retrying with total_minor:", total)
    const c2 = await api("POST", `/pos/carts/${cartId}/checkout`, {
      headers: auth,
      body: { idempotency_key: idem, confirmed_total_minor: total, payments: [{ ...pay, amount_minor: total }], guest_email: `audit-${uid()}@pos.eatsie.local` },
    })
    console.log("4. checkout attempt #2 (with confirmed total):", c2.status)
    const b2 = c2.body
    if (c2.status === 201) {
      console.log("   ⚠️ CHECKOUT SUCCEEDED for OUT-OF-CHANNEL variant!")
      console.log("   order_id:", b2.order?.id, "total:", b2.order?.total, "items:", (b2.order?.items || []).map(i => ({ sku: i.variant_sku, qty: i.quantity })))
    } else {
      console.log("   blocked:", JSON.stringify({ code: b2?.code, message: b2?.message }).slice(0, 400))
    }
  } else {
    console.log("   blocked on first attempt:", JSON.stringify({ code: b1?.code, message: b1?.message }).slice(0, 400))
  }
  console.log("\n═══ END ═══")
}

main().catch((e) => { console.error(e); process.exit(1) })
