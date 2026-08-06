import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { classifyRegionalProduct } from "./lib/classify-regional-product.js"
import { normalizeApprovedAction, readCatalogCleanupCsv } from "./lib/catalog-cleanup.js"

function csvEscape(value: unknown): string {
  const text = String(value ?? "")
  const escaped = text.replace(/"/g, '""')
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}

function duplicateKey(product: any) {
  return String(product.title || "")
    .toLowerCase()
    .replace(/\b\d{6,}\b/g, "")
    .replace(/\b[0-9a-f]{6,}\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function recommendedAction(product: any, classification: ReturnType<typeof classifyRegionalProduct>, duplicateGroup: string) {
  if (!classification.mandatoryForStorefront && product.status === "published") {
    return "remove from sales channel"
  }
  if (classification.classification === "TEST_DATA" || classification.classification === "DEBUG_DATA") {
    return "archive after review"
  }
  if (classification.classification === "INVALID_DATA") {
    return "unpublish"
  }
  if (duplicateGroup) {
    return "merge manually"
  }
  return "keep"
}

export default async function reportProductCatalogCleanup({ container }: ExecArgs) {
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
      "sales_channels.name",
      "variants.id",
      "variants.title",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
  })

  // Preserve deliberate CSV approvals across audit refreshes. Only legacy
  // formatting aliases are normalized; no approval decision is invented.
  const existingApprovals = new Map(
    readCatalogCleanupCsv().map((row) => [row.product_id, normalizeApprovedAction(row.approved_action)])
  )

  const groups = new Map<string, any[]>()
  for (const product of products || []) {
    const key = duplicateKey(product)
    if (!key) continue
    groups.set(key, [...(groups.get(key) || []), product])
  }

  const rows: string[][] = [[
    "product_id",
    "title",
    "handle",
    "status",
    "sales_channel_membership",
    "variant_ids",
    "cad_price",
    "usd_price",
    "created_at",
    "updated_at",
    "likely_test_product",
    "duplicate_group",
    "recommended_action",
    "approved_action",
  ]]

  let likelyTestProducts = 0
  let duplicateProducts = 0

  for (const product of products || []) {
    const classification = classifyRegionalProduct(product as any)
    const key = duplicateKey(product)
    const duplicateMembers = key ? groups.get(key) || [] : []
    const duplicateGroup = duplicateMembers.length > 1 ? key : ""
    const likelyTest = classification.classification !== "PRODUCTION_STOREFRONT"

    if (likelyTest) likelyTestProducts++
    if (duplicateGroup) duplicateProducts++

    const variants = product.variants || []
    const prices = variants.flatMap((variant: any) => variant.prices || [])
    const cadPrices = prices
      .filter((price: any) => String(price.currency_code || "").toLowerCase() === "cad")
      .map((price: any) => price.amount)
      .join("|")
    const usdPrices = prices
      .filter((price: any) => String(price.currency_code || "").toLowerCase() === "usd")
      .map((price: any) => price.amount)
      .join("|")

    rows.push([
      product.id,
      product.title,
      product.handle || "",
      product.status,
      (product.sales_channels || []).map((channel: any) => channel.id || channel.name).filter(Boolean).join("|"),
      variants.map((variant: any) => variant.id).join("|"),
      cadPrices,
      usdPrices,
      product.created_at || "",
      product.updated_at || "",
      likelyTest ? `yes: ${classification.classification}; ${classification.reasons.join(" | ")}` : "no",
      duplicateGroup,
      recommendedAction(product, classification, duplicateGroup),
      existingApprovals.get(product.id) || "",
    ].map(String))
  }

  const reportsDir = path.resolve(process.cwd(), "reports")
  fs.mkdirSync(reportsDir, { recursive: true })
  const reportPath = path.join(reportsDir, "product-catalog-cleanup-audit.csv")
  fs.writeFileSync(reportPath, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8")

  logger.info("[PRODUCT_CATALOG_CLEANUP_AUDIT]")
  logger.info(JSON.stringify({
    reportPath,
    productCount: Math.max(0, rows.length - 1),
    likelyTestProducts,
    duplicateProducts,
  }, null, 2))
}
