import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { classifyRegionalProduct } from "./lib/classify-regional-product.js"

interface AuditedPrice {
  id?: string
  currency_code?: string
  amount?: number
  price_set_id?: string
}

interface AuditedVariant {
  id: string
  title: string
  prices?: AuditedPrice[]
}

interface AuditedProduct {
  id: string
  title: string
  handle?: string
  status: string
  metadata?: any
  variants?: AuditedVariant[]
}

interface PriceSetLink {
  variant_id?: string
  price_set_id?: string
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "")
  const escaped = text.replace(/"/g, '""')
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}

function loadExplicitUsdSources(cwd: string): Map<string, string> {
  const sources = new Map<string, string>()
  const approvedPath = path.resolve(cwd, "approved-production-usd-prices.csv")

  if (!fs.existsSync(approvedPath)) {
    return sources
  }

  const lines = fs.readFileSync(approvedPath, "utf8").split(/\r?\n/).filter(Boolean)
  if (lines.length <= 1) {
    return sources
  }

  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase())
  const variantIndex = headers.indexOf("variant_id")
  const usdIndex = headers.indexOf("usd_amount")
  const sourceIndex = headers.indexOf("source")

  if (variantIndex < 0 || usdIndex < 0) {
    return sources
  }

  for (const line of lines.slice(1)) {
    const cols = line.match(/("([^"]|"")*"|[^,]*)/g)?.filter((part) => part !== ",") || []
    const clean = cols.map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim())
    const variantId = clean[variantIndex]
    const amount = clean[usdIndex]
    const source = sourceIndex >= 0 ? clean[sourceIndex] : ""

    if (!variantId || !amount) continue
    if (/conversion|rate|converted/i.test(source)) continue
    sources.set(variantId, amount)
  }

  return sources
}

export default async function reportMissingUsdPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: rawProducts } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "status",
      "metadata",
      "variants.id",
      "variants.title",
      "variants.prices.id",
      "variants.prices.currency_code",
      "variants.prices.amount",
      "variants.prices.price_set_id",
    ],
  })

  const products = rawProducts as unknown as AuditedProduct[]
  const variantIds = products.flatMap((product) => (product.variants || []).map((variant) => variant.id))
  const priceSetByVariantId = new Map<string, string>()

  if (variantIds.length) {
    const { data: links } = await query.graph({
      entity: "product_variant_price_set",
      fields: ["variant_id", "price_set_id"],
      filters: { variant_id: variantIds },
    })

    for (const link of (links || []) as PriceSetLink[]) {
      if (link.variant_id && link.price_set_id) {
        priceSetByVariantId.set(link.variant_id, link.price_set_id)
      }
    }
  }

  const explicitUsdSources = loadExplicitUsdSources(process.cwd())
  const rows: string[][] = [[
    "product_id",
    "product_title",
    "product_handle",
    "variant_id",
    "variant_title",
    "cad_price",
    "current_usd_price",
    "suggested_usd_price",
    "status",
  ]]

  const missingRows: any[] = []

  for (const product of products) {
    const classification = classifyRegionalProduct(product)
    if (!classification.mandatoryForStorefront) {
      continue
    }

    for (const variant of product.variants || []) {
      const prices = variant.prices || []
      const cadPrice = prices.find((price) => price.currency_code?.toLowerCase() === "cad")
      const usdPrice = prices.find((price) => price.currency_code?.toLowerCase() === "usd")

      if (usdPrice) {
        continue
      }

      const priceSetIds = Array.from(
        new Set([
          priceSetByVariantId.get(variant.id),
          ...prices.map((price) => price.price_set_id).filter(Boolean),
        ])
      )

      const row = {
        product_id: product.id,
        product_title: product.title,
        product_handle: product.handle || "",
        variant_id: variant.id,
        variant_title: variant.title,
        cad_price: cadPrice?.amount ?? "",
        current_usd_price: "",
        suggested_usd_price: explicitUsdSources.get(variant.id) || "",
        status: "missing_usd",
        existing_price_set_ids: priceSetIds.join("|"),
        cad_price_id: cadPrice?.id || "",
      }

      missingRows.push(row)
      rows.push([
        row.product_id,
        row.product_title,
        row.product_handle,
        row.variant_id,
        row.variant_title,
        row.cad_price,
        row.current_usd_price,
        row.suggested_usd_price,
        row.status,
      ].map(String))
    }
  }

  const reportsDir = path.resolve(process.cwd(), "reports")
  fs.mkdirSync(reportsDir, { recursive: true })
  const reportPath = path.join(reportsDir, "missing-usd-prices.csv")
  fs.writeFileSync(reportPath, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8")

  logger.info("[MISSING_USD_PRICE_REPORT]")
  logger.info(JSON.stringify({
    reportPath,
    missingUsdVariantCount: missingRows.length,
    rows: missingRows,
  }, null, 2))
}
