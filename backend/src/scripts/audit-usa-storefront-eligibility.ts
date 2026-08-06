import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const USA_REGION_ID = "reg_01KXT623CTGM9NJJYK2G4DQW7E"
const USA_COUNTRY_CODE = "us"
const USD = "usd"
const DEFAULT_SALES_CHANNEL_ID = "sc_01KVJF9HK0YY92JES8P7VPZN12"
const TEST_OR_DEBUG = /\btest\b|\be2e\b|debug|codex verification|cad-only|usd-only|empty file|browser test|smoke test/i

const AUDIT_JSON = "usa-storefront-product-eligibility-audit.json"
const AUDIT_CSV = "usa-storefront-product-eligibility-audit.csv"
const SUMMARY_MD = "usa-storefront-product-eligibility-summary.md"
const REVIEW_CSV = "usa-missing-usd-price-review.csv"
const VALIDATION_JSON = "usa-missing-usd-price-validation.json"
const DRY_RUN_JSON = "usa-usd-price-import-dry-run.json"

const AUDIT_HEADERS = [
  "product_id",
  "product_handle",
  "product_title",
  "product_status",
  "sales_channel_ids",
  "product_type",
  "variant_count",
  "first_variant_id",
  "first_variant_title",
  "first_variant_sku",
  "first_variant_price_set_id",
  "first_variant_usd_amount",
  "first_variant_calculated_currency",
  "first_variant_calculated_amount",
  "inventory_available",
  "storefront_visible",
  "primary_classification",
  "secondary_flags",
  "frontend_included",
]

const REVIEW_HEADERS = [
  "product_id",
  "product_handle",
  "product_title",
  "variant_id",
  "variant_title",
  "sku",
  "current_cad_amount",
  "current_cad_currency",
  "existing_usd_amount",
  "proposed_usd_amount",
  "proposal_source",
  "review_status",
  "validation_error",
  "notes",
]

type ProductRecord = Record<string, any>
type VariantRecord = Record<string, any>

function csvEscape(value: unknown) {
  const text = String(value ?? "")
  const escaped = text.replace(/"/g, '""')
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}

function writeCsv(filePath: string, headers: string[], rows: Array<Record<string, unknown>>) {
  fs.writeFileSync(
    filePath,
    [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n") + "\n",
    "utf8"
  )
}

function ensureReportsDir() {
  const reportsDir = path.resolve(process.cwd(), "reports")
  fs.mkdirSync(reportsDir, { recursive: true })
  return reportsDir
}

function storefrontVisibility(product: ProductRecord) {
  const metadata = product?.metadata || {}
  if (metadata.storefront_visibility === "hidden" || metadata.catalog_classification === "test_or_debug_product") {
    return { visible: false, reason: "catalog_metadata" }
  }

  return TEST_OR_DEBUG.test(`${product?.title || ""} ${product?.handle || ""}`)
    ? { visible: false, reason: "test_or_debug" }
    : { visible: true, reason: "public" }
}

function priceForCurrency(variant: VariantRecord | null | undefined, currency: string) {
  return (variant?.prices || []).find((price: any) => String(price.currency_code || "").toLowerCase() === currency) || null
}

function validCalculatedUsd(variant: VariantRecord | null | undefined) {
  const calculated = variant?.calculated_price || {}
  const amount = Number(calculated.calculated_amount ?? calculated.amount)
  return String(calculated.currency_code || "").toLowerCase() === USD && Number.isFinite(amount) && amount > 0
}

function inventoryAvailable(variant: VariantRecord | null | undefined) {
  if (!variant) return false
  if (variant.allow_backorder) return true
  if (!variant.manage_inventory) return true
  if (variant.inventory_quantity === undefined || variant.inventory_quantity === null) return true
  return Number(variant.inventory_quantity) > 0
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const parseLine = (line: string) => {
    const cells: string[] = []
    let quoted = false
    let cell = ""
    for (let index = 0; index < line.length; index++) {
      const character = line[index]
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          cell += '"'
          index++
        } else {
          quoted = !quoted
        }
      } else if (character === "," && !quoted) {
        cells.push(cell)
        cell = ""
      } else {
        cell += character
      }
    }
    cells.push(cell)
    return cells.map((value) => value.trim())
  }
  const headers = parseLine(lines[0]).map((header) => header.toLowerCase())
  return lines.slice(1).map((line) => Object.fromEntries(parseLine(line).map((value, index) => [headers[index], value])))
}

function readApprovedUsdByVariant() {
  const sources = [
    { path: path.resolve(process.cwd(), "reports", "merchant-approved-regional-prices.csv"), type: "merchant-approved-regional-prices" },
    { path: path.resolve(process.cwd(), "approved-production-usd-prices.csv"), type: "approved-production-usd-prices" },
  ]
  const approved = new Map<string, { amount: string; source: string }>()

  for (const source of sources) {
    if (!fs.existsSync(source.path)) continue
    for (const row of parseCsv(fs.readFileSync(source.path, "utf8"))) {
      const variantId = String(row.variant_id || "").trim()
      if (!variantId) continue
      const approvalStatus = String(row.approval_status || row.action || "").trim().toLowerCase()
      const usdAmount = String(row.approved_usd_price || row.usd_amount || "").trim()
      if (!usdAmount) continue
      if (source.type === "merchant-approved-regional-prices" && approvalStatus !== "approved") continue
      if (source.type === "approved-production-usd-prices" && approvalStatus !== "create") continue
      approved.set(variantId, { amount: usdAmount, source: source.type })
    }
  }

  return approved
}

async function getDefaultPublishableKey(query: any) {
  const { data } = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "token", "type"],
    filters: { type: "publishable" },
  })

  const key = (data || []).find((item: any) => item.title === "Default Publishable API Key") || null
  if (!key?.token) {
    throw new Error("Default Publishable API Key was not found")
  }
  return key
}

async function fetchAllStoreProducts(token: string) {
  const baseUrl = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const productsById = new Map<string, ProductRecord>()
  const statuses: number[] = []
  let offset = 0
  let total = Number.POSITIVE_INFINITY

  while (offset < total) {
    const url = new URL(`${baseUrl}/store/products`)
    url.searchParams.set("limit", "100")
    url.searchParams.set("offset", String(offset))
    url.searchParams.set("region_id", USA_REGION_ID)
    url.searchParams.set("country_code", USA_COUNTRY_CODE)
    url.searchParams.set("fields", "id,title,handle,metadata,type.*,variants.id,variants.title,variants.sku,variants.manage_inventory,variants.allow_backorder,variants.inventory_quantity,variants.calculated_price.*")

    const response = await fetch(url, {
      headers: { "x-publishable-api-key": token },
    })
    statuses.push(response.status)
    if (!response.ok) {
      throw new Error(`Store API returned HTTP ${response.status}`)
    }

    const payload = await response.json()
    total = Number(payload.count ?? 0)
    const page = Array.isArray(payload.products) ? payload.products : []
    for (const product of page) {
      if (product?.id) productsById.set(product.id, product)
    }
    if (!page.length) break
    offset += page.length
  }

  return { products: Array.from(productsById.values()), statuses, count: Number.isFinite(total) ? total : productsById.size }
}

function primaryClassification(input: {
  dbProduct: ProductRecord
  storeProduct: ProductRecord
  firstDbVariant: VariantRecord | null
  firstStoreVariant: VariantRecord | null
  priceSetId: string
  visibility: { visible: boolean; reason: string }
  inDefaultChannel: boolean
  duplicateIssue: boolean
}) {
  const { dbProduct, firstDbVariant, firstStoreVariant, priceSetId, visibility, inDefaultChannel, duplicateIssue } = input
  if (dbProduct.status !== "published") return "unpublished"
  if (!inDefaultChannel) return "outsideDefaultSalesChannel"
  if (!firstDbVariant) return "missingVariants"
  if (!priceSetId) return "missingPriceSet"
  if (!visibility.visible) return "storefrontClassificationExcluded"
  if (validCalculatedUsd(firstStoreVariant)) return "visibleWithValidUsdPrice"
  const usdPrice = priceForCurrency(firstDbVariant, USD)
  if (!usdPrice) return "missingUsdAmount"
  const calculatedCurrency = String(firstStoreVariant?.calculated_price?.currency_code || "").toLowerCase()
  if (!firstStoreVariant?.calculated_price) return "usdExistsButCalculatedPriceMissing"
  if (calculatedCurrency !== USD) return "incorrectCalculatedCurrency"
  if (duplicateIssue) return "duplicateIssue"
  return "other"
}

function markdownSummary(summary: any) {
  const classificationLines = Object.entries(summary.classification)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n")

  return [
    "# USA Storefront Product Eligibility Audit",
    "",
    "- Scope: Default Publishable API Key, Default Sales Channel, USA region.",
    "- Money unit in this audit/review CSV: Medusa v2 product price major units.",
    "- Business data writes: 0",
    "",
    "## Reconciliation",
    "",
    `accessible products = ${summary.initialAccessibleProducts}`,
    `classified products = ${summary.classifiedProducts}`,
    `unclassified products = ${summary.unclassifiedProducts}`,
    "",
    "## Primary Classification",
    "",
    classificationLines,
    "",
    "## Variant Pricing",
    "",
    `- total variants: ${summary.totalVariants}`,
    `- variants with valid USD calculated prices: ${summary.variantsWithValidUsdPrices}`,
    `- variants requiring USD price review: ${summary.variantsRequiringUsdPrices}`,
    "",
    "## Review State",
    "",
    `- review rows: ${summary.reviewRows}`,
    `- approved rows: ${summary.approvedRows}`,
    `- needs-review rows: ${summary.needsReviewRows}`,
    `- invalid rows: ${summary.invalidRows}`,
    "",
    "Live import was not executed because rows still require explicit merchant/user USD price approval.",
    "",
  ].join("\n")
}

export default async function auditUsaStorefrontEligibility({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const reportsDir = ensureReportsDir()
  const key = await getDefaultPublishableKey(query)
  const store = await fetchAllStoreProducts(key.token)
  const productIds = store.products.map((product) => product.id)
  const storeById = new Map(store.products.map((product) => [product.id, product]))
  const approvedUsdByVariant = readApprovedUsdByVariant()

  const { data: dbProducts } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "status",
      "metadata",
      "type.value",
      "sales_channels.id",
      "sales_channels.name",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.manage_inventory",
      "variants.allow_backorder",
      "variants.inventory_quantity",
      "variants.prices.id",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.prices.price_set_id",
    ],
    filters: { id: productIds },
  })

  const dbById = new Map((dbProducts || []).map((product: any) => [product.id, product]))
  const variantIds = (dbProducts || []).flatMap((product: any) => (product.variants || []).map((variant: any) => variant.id))
  const { data: priceSetLinks } = variantIds.length
    ? await query.graph({
      entity: "product_variant_price_set",
      fields: ["variant_id", "price_set_id"],
      filters: { variant_id: variantIds },
    })
    : { data: [] }
  const priceSetByVariantId = new Map((priceSetLinks || []).map((link: any) => [link.variant_id, link.price_set_id]))

  const handles = new Map<string, number>()
  for (const product of store.products) {
    const handle = String(product.handle || "")
    if (handle) handles.set(handle, (handles.get(handle) || 0) + 1)
  }

  const classification = {
    visibleWithValidUsdPrice: 0,
    missingVariants: 0,
    missingPriceSet: 0,
    missingUsdAmount: 0,
    usdExistsButCalculatedPriceMissing: 0,
    incorrectCalculatedCurrency: 0,
    outsideDefaultSalesChannel: 0,
    unpublished: 0,
    storefrontClassificationExcluded: 0,
    inventoryExcluded: 0,
    duplicateIssue: 0,
    other: 0,
  }
  const auditRows: Array<Record<string, unknown>> = []
  const reviewRows: Array<Record<string, unknown>> = []
  const validationIssues: Array<Record<string, unknown>> = []
  const seenReviewVariants = new Set<string>()
  let totalVariants = 0
  let variantsWithValidUsdPrices = 0

  for (const storeProduct of store.products) {
    const dbProduct = dbById.get(storeProduct.id) || storeProduct
    const dbVariants = Array.isArray(dbProduct.variants) ? dbProduct.variants : []
    const storeVariants = Array.isArray(storeProduct.variants) ? storeProduct.variants : []
    totalVariants += dbVariants.length
    variantsWithValidUsdPrices += storeVariants.filter((variant: any) => validCalculatedUsd(variant)).length
    const firstDbVariant = dbVariants[0] || null
    const firstStoreVariant = storeVariants[0] || null
    const priceSetId = firstDbVariant
      ? priceForCurrency(firstDbVariant, "cad")?.price_set_id || priceForCurrency(firstDbVariant, "usd")?.price_set_id || priceSetByVariantId.get(firstDbVariant.id) || ""
      : ""
    const visibility = storefrontVisibility(dbProduct)
    const inDefaultChannel = (dbProduct.sales_channels || []).some((channel: any) => channel.id === DEFAULT_SALES_CHANNEL_ID)
    const duplicateIssue = Boolean(storeProduct.handle && (handles.get(storeProduct.handle) || 0) > 1)
    const primary = primaryClassification({ dbProduct, storeProduct, firstDbVariant, firstStoreVariant, priceSetId, visibility, inDefaultChannel, duplicateIssue })
    classification[primary as keyof typeof classification] += 1

    const secondaryFlags = [
      dbProduct.status !== "published" ? "unpublished" : "",
      !inDefaultChannel ? "outside_default_sales_channel" : "",
      !visibility.visible ? `storefront_${visibility.reason}` : "",
      duplicateIssue ? "duplicate_handle" : "",
      firstDbVariant && !inventoryAvailable(firstStoreVariant || firstDbVariant) ? "inventory_unavailable_cart_blocked" : "",
      firstDbVariant && !priceForCurrency(firstDbVariant, USD) ? "first_variant_missing_usd_amount" : "",
      firstStoreVariant && !validCalculatedUsd(firstStoreVariant) ? "first_variant_missing_valid_usd_calculated_price" : "",
    ].filter(Boolean)

    auditRows.push({
      product_id: dbProduct.id,
      product_handle: dbProduct.handle || "",
      product_title: dbProduct.title || "",
      product_status: dbProduct.status || "",
      sales_channel_ids: (dbProduct.sales_channels || []).map((channel: any) => channel.id).join("|"),
      product_type: dbProduct.type?.value || "",
      variant_count: dbVariants.length,
      first_variant_id: firstDbVariant?.id || "",
      first_variant_title: firstDbVariant?.title || "",
      first_variant_sku: firstDbVariant?.sku || "",
      first_variant_price_set_id: priceSetId,
      first_variant_usd_amount: priceForCurrency(firstDbVariant, USD)?.amount ?? "",
      first_variant_calculated_currency: firstStoreVariant?.calculated_price?.currency_code || "",
      first_variant_calculated_amount: firstStoreVariant?.calculated_price?.calculated_amount ?? firstStoreVariant?.calculated_price?.amount ?? "",
      inventory_available: inventoryAvailable(firstStoreVariant || firstDbVariant),
      storefront_visible: visibility.visible,
      primary_classification: primary,
      secondary_flags: secondaryFlags.join("|"),
      frontend_included: primary === "visibleWithValidUsdPrice",
    })

    if (dbProduct.status === "published" && inDefaultChannel && visibility.visible && dbVariants.length) {
      for (const dbVariant of dbVariants) {
        const storeVariant = storeVariants.find((variant: any) => variant.id === dbVariant.id)
        if (validCalculatedUsd(storeVariant)) continue
        const variantPriceSetId = priceForCurrency(dbVariant, "cad")?.price_set_id || priceForCurrency(dbVariant, "usd")?.price_set_id || priceSetByVariantId.get(dbVariant.id) || ""
        if (!variantPriceSetId) continue
        const cad = priceForCurrency(dbVariant, "cad")
        const usd = priceForCurrency(dbVariant, USD)
        const approved = approvedUsdByVariant.get(dbVariant.id)
        const validationError = seenReviewVariants.has(dbVariant.id) ? "duplicate variant row" : ""
        if (validationError) validationIssues.push({ variantId: dbVariant.id, reason: validationError })
        seenReviewVariants.add(dbVariant.id)
        reviewRows.push({
          product_id: dbProduct.id,
          product_handle: dbProduct.handle || "",
          product_title: dbProduct.title || "",
          variant_id: dbVariant.id,
          variant_title: dbVariant.title || "",
          sku: dbVariant.sku || "",
          current_cad_amount: cad?.amount ?? "",
          current_cad_currency: cad ? "cad" : "",
          existing_usd_amount: usd?.amount ?? "",
          proposed_usd_amount: approved?.amount || "",
          proposal_source: approved?.source || "none_available",
          review_status: approved?.amount ? "APPROVED_FROM_EXISTING_SOURCE" : "NEEDS_REVIEW",
          validation_error: validationError,
          notes: approved?.amount
            ? "Existing approved USD value found; verify before live import."
            : "Merchant/user must provide an explicit USD major-unit amount. CAD was not converted or copied.",
        })
      }
    }
  }

  const invalidReviewRows = reviewRows.filter((row) => row.validation_error)
  const approvedRows = reviewRows.filter((row) => row.review_status === "APPROVED_FROM_EXISTING_SOURCE")
  const needsReviewRows = reviewRows.filter((row) => row.review_status === "NEEDS_REVIEW")
  const dryRun = {
    mode: "DRY_RUN",
    status: needsReviewRows.length || invalidReviewRows.length ? "NOT_RUN_PENDING_PRICE_APPROVAL" : "READY_FOR_IMPORTER_DRY_RUN",
    variantsExamined: totalVariants,
    variantsMatched: reviewRows.length,
    rowsApproved: approvedRows.length,
    rowsSkipped: needsReviewRows.length,
    rowsInvalid: invalidReviewRows.length,
    pricesToCreate: approvedRows.length,
    pricesToUpdate: 0,
    existingValidPricesPreserved: variantsWithValidUsdPrices,
    expectedFinalEligibleProductCount: classification.visibleWithValidUsdPrice + approvedRows.length,
    databaseWrites: 0,
    existingUsdPricesModified: 0,
    cadPricesModified: 0,
    productsModified: 0,
    inventoryModified: 0,
  }
  const summary = {
    initialAccessibleProducts: store.products.length,
    storeApiReportedCount: store.count,
    storeApiStatuses: store.statuses,
    classifiedProducts: auditRows.length,
    unclassifiedProducts: store.products.length - auditRows.length,
    classification,
    totalVariants,
    variantsWithValidUsdPrices,
    variantsRequiringUsdPrices: reviewRows.length,
    currentVisibleUsaProducts: classification.visibleWithValidUsdPrice,
    eligibleAfterApprovedPricing: classification.visibleWithValidUsdPrice + approvedRows.length,
    productsStillLegitimatelyExcluded: store.products.length - classification.visibleWithValidUsdPrice,
    reviewRows: reviewRows.length,
    approvedRows: approvedRows.length,
    needsReviewRows: needsReviewRows.length,
    invalidRows: invalidReviewRows.length,
    moneyUnit: "major",
    businessDataWrites: 0,
  }
  const validation = {
    totalRows: reviewRows.length,
    approvedRows: approvedRows.length,
    needsReviewRows: needsReviewRows.length,
    invalidRows: invalidReviewRows.length,
    duplicateRows: validationIssues.length,
    alreadyPricedRows: 0,
    excludedProducts: auditRows.filter((row) => row.primary_classification !== "visibleWithValidUsdPrice" && row.primary_classification !== "missingUsdAmount").length,
    issues: validationIssues,
    moneyUnit: "major",
    validForLiveImport: reviewRows.length > 0 && needsReviewRows.length === 0 && invalidReviewRows.length === 0,
  }

  fs.writeFileSync(path.join(reportsDir, AUDIT_JSON), JSON.stringify({ summary, products: auditRows }, null, 2) + "\n", "utf8")
  writeCsv(path.join(reportsDir, AUDIT_CSV), AUDIT_HEADERS, auditRows)
  fs.writeFileSync(path.join(reportsDir, SUMMARY_MD), markdownSummary(summary), "utf8")
  writeCsv(path.join(reportsDir, REVIEW_CSV), REVIEW_HEADERS, reviewRows)
  fs.writeFileSync(path.join(reportsDir, VALIDATION_JSON), JSON.stringify(validation, null, 2) + "\n", "utf8")
  fs.writeFileSync(path.join(reportsDir, DRY_RUN_JSON), JSON.stringify(dryRun, null, 2) + "\n", "utf8")

  logger.info("[USA_STOREFRONT_PRODUCT_ELIGIBILITY_AUDIT]")
  logger.info(JSON.stringify({ ...summary, reportsDir, dryRunStatus: dryRun.status }, null, 2))
}
