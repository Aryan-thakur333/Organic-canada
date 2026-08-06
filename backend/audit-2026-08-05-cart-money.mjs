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
  // Use known product: Medusa Sweatpants (DB CAD price = 10, major)
  const list = await api("GET", `/store/products?region_id=${REGION_CA}&fields=id,title,variants.id,variants.sku,variants.calculated_price.*&limit=5`, {
    headers: { "x-publishable-api-key": PUBLISHABLE },
  })
  const product = (list.body?.products || []).find((p) => p.title === "Medusa Sweatpants") || list.body?.products?.[0]
  const variant = product?.variants?.[0]
  console.log("PRODUCT:", product?.title, "| variant:", variant?.id, "| sku:", variant?.sku)
  console.log("CALCULATED_PRICE:", JSON.stringify(variant?.calculated_price))
  const dbCalc = variant?.calculated_price?.calculated_amount

  const cart = await api("POST", "/store/carts", { headers: { "x-publishable-api-key": PUBLISHABLE }, body: { region_id: REGION_CA } })
  const cartId = cart.body?.cart?.id
  const add = await api("POST", `/store/carts/${cartId}/line-items`, {
    headers: { "x-publishable-api-key": PUBLISHABLE },
    body: { variant_id: variant.id, quantity: 2 },
  })
  const c = add.body?.cart
  const item = c?.items?.[0]
  console.log("\nLINE ITEM unit_price:", item?.unit_price, "(if 10 = MAJOR | if 1000 = MINOR)")
  console.log("LINE ITEM subtotal:", item?.subtotal, "| total:", item?.total, "| quantity:", item?.quantity)
  console.log("\nCART subtotal:", c?.subtotal, "| item_subtotal:", c?.item_subtotal)
  console.log("CART total:", c?.total, "| tax_total:", c?.tax_total, "| currency:", c?.currency_code)
  console.log("\nDB calculated_amount (store API):", dbCalc)
  console.log("\nINTERPRETATION:")
  console.log("  If unit_price == calculated_amount -> cart carries MAJOR units (catalog convention).")
  console.log("  Frontend buildCartHydrationPayload does unit_price/100 -> would show 1/100 price. CHECK!")
}

main().catch((e) => { console.error(e); process.exit(1) })
