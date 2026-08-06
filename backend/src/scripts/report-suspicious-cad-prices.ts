import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { classifyRegionalProduct } from "./lib/classify-regional-product.js"

const CANADA_REGION_ID = "reg_01KVJF9HSCYKAZC677GH1AC6C8"
const CANADA_COUNTRY_CODE = "ca"

const seededCatalogPrices = new Map<string, number>([
  ["organic-apples", 4.99],
  ["fresh-bananas", 2.99],
  ["red-strawberries", 6.99],
  ["green-grapes", 5.99],
  ["sweet-mangoes", 7.99],
  ["organic-carrots", 3.99],
  ["fresh-broccoli", 4.49],
  ["green-spinach", 4.99],
  ["red-tomatoes", 3.99],
  ["organic-potatoes", 5.49],
  ["organic-milk", 6.49],
  ["greek-yogurt", 5.99],
  ["cheddar-cheese", 7.99],
  ["fresh-butter", 5.49],
  ["paneer-block", 6.99],
  ["whole-wheat-bread", 4.99],
  ["croissant", 3.49],
  ["sourdough-loaf", 6.99],
  ["muffins-pack", 8.99],
  ["organic-cookies", 6.49],
  ["chicken-breast", 12.99],
  ["lamb-chops", 18.99],
  ["turkey-slices", 10.99],
  ["beef-steak", 22.99],
  ["chicken-sausages", 9.99],
  ["salmon-fillet", 19.99],
  ["fresh-prawns", 16.99],
  ["tuna-steak", 18.99],
  ["crab-meat", 21.99],
  ["white-fish-fillet", 14.99],
])

interface PriceSetLink {
  variant_id?: string
  price_set_id?: string
}

interface VariantWithSelectedPrices {
  id: string
  title: string
  created_at?: string | Date
  prices?: Array<{
    id: string
    amount: number
    currency_code: string
    price_set_id?: string
  }>
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "")
  const escaped = text.replace(/"/g, '""')
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}

function normalizeAmount(value: unknown): number | null {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function inferSuspicion(product: any, cadAmount: number | null) {
  const title = String(product.title || "")
  const titleLower = title.toLowerCase()
  const handle = String(product.handle || "")
  const reasons: string[] = []
  let suggested: string | number = ""

  if (handle && seededCatalogPrices.has(handle)) {
    const sourceAmount = seededCatalogPrices.get(handle)!
    reasons.push("Matched backend/src/scripts/seed-category-products.ts, which seeded grocery CAD prices such as 499 for catalog values that read as 4.99 in major-unit Medusa v2.")
    suggested = sourceAmount
  }

  if (/decimal oil|organic oil|chocolate|currency test/i.test(title)) {
    reasons.push("Title appears in reported storefront price-inflation examples or currency test fixtures; requires merchant review before correction.")
  }

  if (cadAmount !== null && cadAmount >= 100 && Number.isInteger(cadAmount) && /99$|49$|00$/.test(String(cadAmount))) {
    reasons.push("Stored CAD amount is an integer pattern commonly produced by minor-unit seeding, but this alone is not approval to change it.")
  }

  return {
    likelyMinorUnitSeed: reasons.length > 0 ? "yes" : "no",
    suggested,
    reason: reasons.join(" | "),
    status: reasons.length > 0 ? "suspicious_needs_review" : "ok",
  }
}

async function fetchStoreApiProduct(productId: string, publishableKey: string | null) {
  if (!publishableKey || typeof fetch !== "function") return null

  const baseUrl = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const url = `${baseUrl}/store/products/${productId}?region_id=${CANADA_REGION_ID}&country_code=${CANADA_COUNTRY_CODE}&fields=id,variants.id,variants.calculated_price.*`

  try {
    const response = await fetch(url, {
      headers: { "x-publishable-api-key": publishableKey },
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

async function getPublishableKey(query: any) {
  if (process.env.MEDUSA_PUBLISHABLE_KEY) return process.env.MEDUSA_PUBLISHABLE_KEY

  try {
    const { data } = await query.graph({
      entity: "api_key",
      fields: ["id", "token", "type"],
      filters: { type: "publishable" },
    })
    return data?.[0]?.token || null
  } catch {
    return null
  }
}

export default async function reportSuspiciousCadPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "status",
      "metadata",
      "created_at",
      "updated_at",
      "sales_channels.id",
      "variants.id",
      "variants.title",
      "variants.created_at",
      "variants.updated_at",
      "variants.prices.id",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.prices.price_set_id",
    ],
  })

  const variantIds = (products || []).flatMap((product: any) => (product.variants || []).map((variant: any) => variant.id))
  const priceSetByVariantId = new Map<string, string>()
  if (variantIds.length) {
    const { data: links } = await query.graph({
      entity: "product_variant_price_set",
      fields: ["variant_id", "price_set_id"],
      filters: { variant_id: variantIds },
    })
    for (const link of (links || []) as PriceSetLink[]) {
      if (link.variant_id && link.price_set_id) priceSetByVariantId.set(link.variant_id, link.price_set_id)
    }
  }

  const publishableKey = await getPublishableKey(query)
  const storeApiByProductId = new Map<string, any>()
  const rows: string[][] = [[
    "product_id",
    "product_title",
    "product_handle",
    "variant_id",
    "variant_title",
    "price_set_id",
    "stored_cad_price",
    "store_api_calculated_cad_price",
    "current_usd_price",
    "source_or_created_at",
    "likely_minor_unit_seed",
    "suggested_corrected_cad_price",
    "correction_reason",
    "approved_corrected_cad_price",
    "status",
  ]]

  let audited = 0
  let suspicious = 0

  for (const product of products || []) {
    const classification = classifyRegionalProduct(product as any)
    if (!classification.mandatoryForStorefront) continue

    if (!storeApiByProductId.has(product.id)) {
      storeApiByProductId.set(product.id, await fetchStoreApiProduct(product.id, publishableKey))
    }
    const apiProduct = storeApiByProductId.get(product.id)?.product

    for (const variant of product.variants || []) {
      const pricedVariant = variant as typeof variant & VariantWithSelectedPrices
      const prices = pricedVariant.prices || []
      const cad = prices.find((price: any) => String(price.currency_code || "").toLowerCase() === "cad")
      const usd = prices.find((price: any) => String(price.currency_code || "").toLowerCase() === "usd")
      const cadAmount = normalizeAmount(cad?.amount)
      const apiVariant = apiProduct?.variants?.find((item: any) => item.id === pricedVariant.id)
      const apiAmount = apiVariant?.calculated_price?.calculated_amount ?? ""
      const priceSetId = cad?.price_set_id || usd?.price_set_id || priceSetByVariantId.get(pricedVariant.id) || ""
      const suspicion = inferSuspicion(product, cadAmount)

      audited++
      if (suspicion.status !== "ok") suspicious++

      rows.push([
        product.id,
        product.title,
        product.handle || "",
        pricedVariant.id,
        pricedVariant.title,
        priceSetId,
        cadAmount ?? "",
        apiAmount,
        usd?.amount ?? "",
        product.created_at || pricedVariant.created_at || "",
        suspicion.likelyMinorUnitSeed,
        suspicion.suggested,
        suspicion.reason,
        "",
        suspicion.status,
      ].map(String))
    }
  }

  const reportsDir = path.resolve(process.cwd(), "reports")
  fs.mkdirSync(reportsDir, { recursive: true })
  const reportPath = path.join(reportsDir, "suspicious-cad-prices.csv")
  fs.writeFileSync(reportPath, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8")

  logger.info("[SUSPICIOUS_CAD_PRICE_REPORT]")
  logger.info(JSON.stringify({ reportPath, audited, suspicious }, null, 2))
}
