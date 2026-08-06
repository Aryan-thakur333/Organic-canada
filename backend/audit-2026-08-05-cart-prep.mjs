const BASE = "http://localhost:9000"
const PUBLISHABLE = "pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491"
const REGION_CA = "reg_01KVJF9HSCYKAZC677GH1AC6C8"

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

async function main() {
  // Find chocolate product + variant in store API
  const list = await api("GET", `/store/products?region_id=${REGION_CA}&fields=id,title,handle,variants.id,variants.title,variants.calculated_price.*&limit=20`, {
    headers: { "x-publishable-api-key": PUBLISHABLE },
  })
  const choc = (list.body?.products || []).find((p) => String(p.title || "").toLowerCase().includes("chocolate"))
  const prod = choc || list.body?.products?.[0]
  console.log("PRODUCT:", prod?.title, "| handle:", prod?.handle, "| id:", prod?.id)
  const variant = prod?.variants?.[0]
  console.log("VARIANT:", variant?.id, "| calc:", JSON.stringify(variant?.calculated_price))

  const cart = await api("POST", "/store/carts", { headers: { "x-publishable-api-key": PUBLISHABLE }, body: { region_id: REGION_CA } })
  const cartId = cart.body?.cart?.id
  const add = await api("POST", `/store/carts/${cartId}/line-items`, {
    headers: { "x-publishable-api-key": PUBLISHABLE },
    body: { variant_id: variant.id, quantity: 2 },
  })
  const c = add.body?.cart
  console.log("\nCART_ID:", cartId)
  console.log("CART:", JSON.stringify({ id: c?.id, currency: c?.currency_code, subtotal: c?.subtotal, total: c?.total, item_subtotal: c?.item_subtotal, items: (c?.items || []).map(i => ({ title: i.title, unit_price: i.unit_price, quantity: i.quantity })) }, null, 2))
  console.log("\nPRODUCT_HANDLE:", prod?.handle)
}

main().catch((e) => { console.error(e); process.exit(1) })
