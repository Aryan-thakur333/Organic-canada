/**
 * One-time idempotent price repair script for the Organic Starter Bundle.
 *
 * Sets prices from wrong integer values (2199/2999) to correct major-unit values (21.99/29.99).
 *
 * Usage (with admin credentials):
 *   MEDUSA_ADMIN_EMAIL=admin@eatsie.ca \
 *   MEDUSA_ADMIN_PASSWORD=yourpassword \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' src/scripts/repair-bundle-prices.ts
 *
 * CRITICAL RULE: Medusa v2 on this project uses MAJOR currency units.
 *   USD target: 21.99 (NOT 2199)
 *   CAD target: 29.99 (NOT 2999)
 */

import axios from "axios"

const BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const ADMIN_EMAIL = process.env.MEDUSA_ADMIN_EMAIL || "admin@eatsie.ca"
const ADMIN_PASSWORD = process.env.MEDUSA_ADMIN_PASSWORD || ""

const PRODUCT_ID = "prod_01KYS9B6S5EVAWZ9JSGAEGG3X5"
const VARIANT_ID = "variant_01KYS9B6W849F8PW4R1H49TA4R"

// Known price record IDs (from audit)
const USD_PRICE_ID = "price_01KYS9B6XAC1M4SQ7PJAJ4HQGM"
const CAD_PRICE_ID = "price_01KYS9B6XAXKVTXEPPNE6FG5HK"

const USD_TARGET = 21.99
const CAD_TARGET = 29.99
const TOLERANCE = 0.001

async function getAdminToken(): Promise<string> {
  const response = await axios.post(`${BACKEND_URL}/auth/user/emailpass`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  const token = response.data?.token
  if (!token) throw new Error("Admin authentication failed — check credentials")
  return token
}

async function run() {
  console.log("\n[price-repair] Bundle Price Repair — Organic Starter Bundle")
  console.log("=".repeat(60))

  if (!ADMIN_PASSWORD) {
    throw new Error("Set MEDUSA_ADMIN_PASSWORD env var before running this script")
  }

  const token = await getAdminToken()
  console.log("[price-repair] ✅ Authenticated as admin")
  const headers = { Authorization: `Bearer ${token}` }

  // Fetch current prices
  const productResponse = await axios.get(
    `${BACKEND_URL}/admin/products/${PRODUCT_ID}?fields=id,title,variants.id,variants.prices.*`,
    { headers }
  )
  const variant = productResponse.data?.product?.variants?.find((v: any) => v.id === VARIANT_ID)
  if (!variant) throw new Error(`Variant ${VARIANT_ID} not found in product`)

  const prices: Array<{ id: string; amount: number; currency_code: string }> = variant.prices || []

  console.log("\n[price-repair] Current stored prices (WRONG — integer/minor unit values):")
  for (const price of prices) {
    console.log(`  ${price.currency_code.toUpperCase()}: ${price.amount} (ID: ${price.id})`)
  }

  const usdPrice = prices.find((p) => p.currency_code.toLowerCase() === "usd")
  const cadPrice = prices.find((p) => p.currency_code.toLowerCase() === "cad")

  const usdNeedsUpdate = !usdPrice || Math.abs(usdPrice.amount - USD_TARGET) > TOLERANCE
  const cadNeedsUpdate = !cadPrice || Math.abs(cadPrice.amount - CAD_TARGET) > TOLERANCE

  if (!usdNeedsUpdate && !cadNeedsUpdate) {
    console.log("\n[price-repair] ✅ Prices already correct. No update needed.")
    return
  }

  console.log("\n[price-repair] Updating to correct major-unit prices...")

  // Update using existing price record IDs (idempotent — no new records created)
  const updatedPrices: any[] = []
  if (usdNeedsUpdate) {
    console.log(`  USD: ${usdPrice?.amount ?? "MISSING"} → ${USD_TARGET}`)
    updatedPrices.push({
      id: usdPrice?.id || USD_PRICE_ID,
      currency_code: "usd",
      amount: USD_TARGET,
    })
  }
  if (cadNeedsUpdate) {
    console.log(`  CAD: ${cadPrice?.amount ?? "MISSING"} → ${CAD_TARGET}`)
    updatedPrices.push({
      id: cadPrice?.id || CAD_PRICE_ID,
      currency_code: "cad",
      amount: CAD_TARGET,
    })
  }

  await axios.post(
    `${BACKEND_URL}/admin/products/${PRODUCT_ID}/variants/${VARIANT_ID}`,
    { prices: updatedPrices },
    { headers }
  )

  // Verify
  const verifyResponse = await axios.get(
    `${BACKEND_URL}/admin/products/${PRODUCT_ID}?fields=id,variants.id,variants.prices.*`,
    { headers }
  )
  const updatedVariant = verifyResponse.data?.product?.variants?.find((v: any) => v.id === VARIANT_ID)
  const verifiedPrices = updatedVariant?.prices || []

  console.log("\n[price-repair] Verification (should be 21.99 USD, 29.99 CAD):")
  let allCorrect = true
  for (const price of verifiedPrices) {
    const expected = price.currency_code === "usd" ? USD_TARGET : CAD_TARGET
    const diff = Math.abs(price.amount - expected)
    const ok = diff < TOLERANCE
    if (!ok) allCorrect = false
    console.log(`  ${price.currency_code.toUpperCase()}: ${price.amount} ${ok ? "✅" : "❌ UNEXPECTED"}`)
  }

  if (allCorrect) {
    console.log("\n[price-repair] ✅ COMPLETE — Prices updated to major-unit values.")
    console.log("  $21.99 USD → storefront will display $21.99")
    console.log("  $29.99 CAD → storefront will display CA$29.99")
  } else {
    throw new Error("Post-update verification failed — check admin API response")
  }
}

run().catch((error) => {
  console.error("\n[price-repair] ❌ FAILED:", error.message)
  process.exit(1)
})
