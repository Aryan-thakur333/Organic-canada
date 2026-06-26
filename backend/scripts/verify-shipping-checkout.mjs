const baseUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const publishableKey = process.env.MEDUSA_PUBLISHABLE_KEY

if (!publishableKey) {
  throw new Error("MEDUSA_PUBLISHABLE_KEY is required")
}

const headers = {
  "content-type": "application/json",
  "x-publishable-api-key": publishableKey,
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers, ...options })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} -> ${response.status}: ${JSON.stringify(body)}`)
  }
  return body
}

const { regions } = await request("/store/regions?limit=100")
const region = regions.find((item) => item.countries?.some((country) => country.iso_2 === "ca")) || regions[0]
if (!region) throw new Error("No Store API region is available")

const { products } = await request("/store/products?limit=100&fields=id,title,*variants")
const candidates = products.flatMap((product) =>
  (product.variants || []).map((variant) => ({ product, variant }))
)
if (!candidates.length) throw new Error("No storefront product variant is available")

const { cart } = await request("/store/carts", {
  method: "POST",
  body: JSON.stringify({ region_id: region.id }),
})

await request(`/store/carts/${cart.id}`, {
  method: "POST",
  body: JSON.stringify({
    email: "checkout-verification@eatsie.local",
    shipping_address: {
      first_name: "Checkout",
      last_name: "Verification",
      address_1: "100 Queen Street West",
      city: "Toronto",
      province: "ON",
      postal_code: "M5H 2N2",
      country_code: "ca",
    },
    billing_address: {
      first_name: "Checkout",
      last_name: "Verification",
      address_1: "100 Queen Street West",
      city: "Toronto",
      province: "ON",
      postal_code: "M5H 2N2",
      country_code: "ca",
    },
  }),
})

let selected
for (const candidate of candidates) {
  try {
    await request(`/store/carts/${cart.id}/line-items`, {
      method: "POST",
      body: JSON.stringify({ variant_id: candidate.variant.id, quantity: 1 }),
    })
    selected = candidate
    break
  } catch {
    // Continue until an in-stock storefront variant is found.
  }
}
if (!selected) throw new Error("No storefront variant could be added to the verification cart")

const { shipping_options: shippingOptions } = await request(
  `/store/shipping-options?cart_id=${cart.id}`
)
if (!shippingOptions?.length) throw new Error("GET /store/shipping-options returned no methods")

await request(`/store/carts/${cart.id}/shipping-methods`, {
  method: "POST",
  body: JSON.stringify({ option_id: shippingOptions[0].id }),
})

const { payment_collection: paymentCollection } = await request("/store/payment-collections", {
  method: "POST",
  body: JSON.stringify({ cart_id: cart.id }),
})
const { payment_providers: providers } = await request(
  `/store/payment-providers?region_id=${region.id}&limit=100`
)
const provider = providers.find((item) =>
  item.id === "pp_system_default" || item.id.includes("manual") || item.id.includes("system")
)
if (!provider) throw new Error("No non-external verification payment provider is configured")

await request(`/store/payment-collections/${paymentCollection.id}/payment-sessions`, {
  method: "POST",
  body: JSON.stringify({ provider_id: provider.id, data: {} }),
})

const result = await request(`/store/carts/${cart.id}/complete`, {
  method: "POST",
  body: JSON.stringify({}),
})
if (result.type !== "order" || !result.order?.id) {
  throw new Error(`Cart completion did not return an order: ${JSON.stringify(result)}`)
}

console.log(JSON.stringify({
  verified: true,
  cart_id: cart.id,
  product_id: selected.product.id,
  variant_id: selected.variant.id,
  shipping_option_ids: shippingOptions.map((option) => option.id),
  selected_shipping_option_id: shippingOptions[0].id,
  payment_provider_id: provider.id,
  order_id: result.order.id,
}, null, 2))
