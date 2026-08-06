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
  try { body = JSON.parse(text) } catch { body = text.slice(0, 400) }
  return { status: res.status, body }
}

async function main() {
  const list = await api("GET", `/store/products?region_id=${REGION_CA}&country_code=ca&fields=id,title,variants.id,variants.title,variants.calculated_price.*&limit=3`, {
    headers: { "x-publishable-api-key": PUBLISHABLE },
  })
  const products = list.body?.products || []
  console.log("store products count:", products.length)
  const product = products[0]
  if (!product) { console.log("NO PRODUCTS"); return }
  const variantId = product.variants?.[0]?.id
  console.log("Using product:", product.title, "variant:", variantId)

  const cart = await api("POST", "/store/carts", { headers: { "x-publishable-api-key": PUBLISHABLE }, body: { region_id: REGION_CA } })
  const cartId = cart.body?.cart?.id
  console.log("cart:", cart.status, cartId)

  const add = await api("POST", `/store/carts/${cartId}/line-items`, {
    headers: { "x-publishable-api-key": PUBLISHABLE },
    body: { variant_id: variantId, quantity: 2 },
  })
  console.log("add status:", add.status)
  const item = add.body?.cart?.items?.[0]
  if (!item) { console.log("ADD BODY:", JSON.stringify(add.body).slice(0, 600)); return }
  console.log("ITEM KEYS:", Object.keys(item))
  console.log("ITEM (raw):", JSON.stringify(item, null, 2).slice(0, 1400))
}

main().catch((e) => { console.error(e); process.exit(1) })
