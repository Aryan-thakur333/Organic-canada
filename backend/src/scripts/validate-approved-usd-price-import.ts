import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const REVIEW_CSV = path.resolve(process.cwd(), "reports", "usa-missing-usd-price-review.csv")
const AUDIT_JSON = path.resolve(process.cwd(), "reports", "usa-storefront-product-eligibility-audit.json")
const VALIDATION_JSON = path.resolve(process.cwd(), "reports", "final-approved-usd-price-validation.json")
const EXCLUSIONS_JSON = path.resolve(process.cwd(), "reports", "storefront-classification-import-exclusions.json")
const DRY_RUN_JSON = path.resolve(process.cwd(), "reports", "final-approved-usd-price-dry-run.json")
const SNAPSHOT_JSON = path.resolve(process.cwd(), "reports", "final-usd-import-preflight-snapshot.json")
const LIVE_RESULT_JSON = path.resolve(process.cwd(), "reports", "final-approved-usd-price-live-import.json")

const DEFAULT_SALES_CHANNEL_ID = "sc_01KVJF9HK0YY92JES8P7VPZN12"
const USA_REGION_ID = "reg_01KXT623CTGM9NJJYK2G4DQW7E"
const USA_COUNTRY_CODE = "us"
const TARGET_CURRENCY = "usd"
const PLACEHOLDER_AMOUNTS = new Set(["0", "0.00", "1", "1.00", "0.01", "999", "999.00", "1000", "1000.00"])
const MIN_MAJOR_AMOUNT = 0.5
const MAX_MAJOR_AMOUNT = 500000

type CsvRow = Record<string, string>
type ProductRecord = Record<string, any>
type VariantRecord = Record<string, any>
type AuditProductRecord = Record<string, any> & {
  product_id?: string
  primary_classification?: string
  secondary_flags?: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string | URL, init: RequestInit, attempts = 4) {
  let response: Response | null = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      response = await fetch(url, init)
    } catch (error) {
      if (attempt === attempts - 1) throw error
      await sleep(500 * (attempt + 1))
      continue
    }
    if (response.status !== 429) return response
    await sleep(500 * (attempt + 1))
  }
  return response as Response
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let entry = ""
  let insideQuote = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === '"') {
      if (insideQuote && line[index + 1] === '"') {
        entry += '"'
        index++
      } else {
        insideQuote = !insideQuote
      }
    } else if (char === "," && !insideQuote) {
      result.push(entry.trim())
      entry = ""
    } else {
      entry += char
    }
  }
  result.push(entry.trim())
  return result
}

function parseCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length <= 1) return []
  const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase())
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line)
    return {
      row_number: String(index + 2),
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, String(cells[cellIndex] ?? "").trim()])),
    }
  })
}

function priceForCurrency(variant: VariantRecord | null | undefined, currency: string) {
  return (variant?.prices || []).find((price: any) => String(price.currency_code || "").toLowerCase() === currency) || null
}

function allPricesForCurrency(variant: VariantRecord | null | undefined, currency: string) {
  return (variant?.prices || []).filter((price: any) => String(price.currency_code || "").toLowerCase() === currency)
}

function parseMajorAmount(value: string): number | null {
  const text = String(value || "").trim()
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text)) return null
  const amount = Number(text)
  return Number.isFinite(amount) ? amount : null
}

function isPublishedDefaultChannelProduct(product: ProductRecord | null | undefined) {
  return Boolean(
    product?.status === "published" &&
    (product.sales_channels || []).some((channel: any) => channel.id === DEFAULT_SALES_CHANNEL_ID)
  )
}

function isValidCalculatedUsd(variant: VariantRecord | null | undefined) {
  const calculated = variant?.calculated_price || {}
  const amount = Number(calculated.calculated_amount ?? calculated.amount)
  return String(calculated.currency_code || "").toLowerCase() === TARGET_CURRENCY && Number.isFinite(amount) && amount > 0
}

async function resolvePriceSetId(query: any, variant: VariantRecord) {
  const fromPrices = (variant.prices || []).find((price: any) => price.price_set_id)?.price_set_id
  if (fromPrices) return fromPrices
  const { data } = await query.graph({
    entity: "product_variant_price_set",
    fields: ["variant_id", "price_set_id"],
    filters: { variant_id: variant.id },
  })
  return (data || []).find((link: any) => link.price_set_id)?.price_set_id || ""
}

async function getDefaultPublishableKey(query: any) {
  const { data } = await query.graph({
    entity: "api_key",
    fields: ["title", "token", "type"],
    filters: { type: "publishable" },
  })
  const key = (data || []).find((item: any) => item.title === "Default Publishable API Key")
  if (!key?.token) throw new Error("Default Publishable API Key was not found")
  return key.token as string
}

async function fetchStoreProduct(token: string, productId: string) {
  const baseUrl = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const response = await fetchWithRetry(`${baseUrl}/store/products/${productId}?region_id=${USA_REGION_ID}&country_code=${USA_COUNTRY_CODE}&fields=id,title,handle,variants.id,variants.calculated_price.*`, {
    headers: { "x-publishable-api-key": token },
  }).catch(() => null)
  if (!response) return null
  if (!response.ok) return null
  return (await response.json()).product || null
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
    url.searchParams.set("fields", "id,title,handle,metadata,variants.id,variants.calculated_price.*")
    const response = await fetchWithRetry(url, { headers: { "x-publishable-api-key": token } })
    statuses.push(response.status)
    if (!response.ok) throw new Error(`Store API returned HTTP ${response.status}`)
    const payload = await response.json()
    total = Number(payload.count || 0)
    const products = Array.isArray(payload.products) ? payload.products : []
    for (const product of products) productsById.set(product.id, product)
    if (!products.length) break
    offset += products.length
  }
  return { products: Array.from(productsById.values()), statuses, count: Number.isFinite(total) ? total : productsById.size }
}

function loadAuditProducts() {
  if (!fs.existsSync(AUDIT_JSON)) return []
  const parsed = JSON.parse(fs.readFileSync(AUDIT_JSON, "utf8"))
  return Array.isArray(parsed.products) ? parsed.products : []
}

function detectPriceUnit(rows: CsvRow[]) {
  const approvedAmounts = rows
    .filter((row) => row.review_status === "APPROVED" && row.proposed_usd_amount)
    .map((row) => row.proposed_usd_amount)

  if (!approvedAmounts.length) return "major"
  const hasDecimal = approvedAmounts.some((value) => String(value).includes("."))
  const hasInteger = approvedAmounts.some((value) => /^\d+$/.test(String(value)))
  if (hasDecimal && hasInteger) return "mixed"
  return "major"
}

async function buildSnapshot(query: any, productIds: string[], token: string) {
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "status",
      "sales_channels.id",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.prices.id",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.prices.price_set_id",
    ],
    filters: productIds.length ? { id: productIds } : {},
  })
  const storeById = new Map<string, ProductRecord>()
  for (const product of products || []) {
    storeById.set(product.id, await fetchStoreProduct(token, product.id))
  }
  return {
    createdAt: new Date().toISOString(),
    usaRegionId: USA_REGION_ID,
    currency: TARGET_CURRENCY,
    products: (products || []).map((product: any) => ({
      id: product.id,
      handle: product.handle || "",
      title: product.title || "",
      variants: (product.variants || []).map((variant: any) => {
        const storeVariant = storeById.get(product.id)?.variants?.find((item: any) => item.id === variant.id)
        return {
          id: variant.id,
          title: variant.title || "",
          sku: variant.sku || "",
          prices: (variant.prices || []).map((price: any) => ({
            id: price.id,
            currency_code: price.currency_code,
            amount: price.amount,
            price_set_id: price.price_set_id,
          })),
          calculated_price: storeVariant?.calculated_price || null,
        }
      }),
    })),
  }
}

export default async function validateApprovedUsdPriceImport({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricing = container.resolve<any>("pricing")
  const apply = process.argv.includes("--apply")

  if (!fs.existsSync(REVIEW_CSV)) throw new Error(`Review CSV not found: ${REVIEW_CSV}`)
  fs.mkdirSync(path.dirname(VALIDATION_JSON), { recursive: true })

  const rows = parseCsv(REVIEW_CSV)
  const auditProducts = loadAuditProducts() as AuditProductRecord[]
  const auditByProductId = new Map<string, AuditProductRecord>(auditProducts.map((product) => [product.product_id || "", product]))
  const reviewVariantIds = new Set(rows.map((row) => row.variant_id).filter(Boolean))
  const token = await getDefaultPublishableKey(query)
  const productIds = Array.from(new Set(rows.map((row) => row.product_id).filter(Boolean)))
  const snapshot = await buildSnapshot(query, productIds, token)
  fs.writeFileSync(SNAPSHOT_JSON, JSON.stringify(snapshot, null, 2) + "\n", "utf8")

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "status",
      "metadata",
      "sales_channels.id",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.prices.id",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.prices.price_set_id",
    ],
    filters: productIds.length ? { id: productIds } : {},
  })
  const productById = new Map((products || []).map((product: any) => [product.id, product]))
  const seen = new Set<string>()
  const validationErrors: Array<Record<string, unknown>> = []
  const plannedCreates: Array<Record<string, unknown>> = []
  let needsReviewRows = 0
  let rejectedRows = 0
  let invalidStatusRows = 0
  let duplicateRows = 0
  let alreadyPricedRows = 0
  const detectedPriceUnit = detectPriceUnit(rows)

  for (const row of rows) {
    const rowNumber = Number(row.row_number)
    const status = row.review_status
    const variantKey = row.variant_id || `row-${rowNumber}`
    if (row.variant_id && seen.has(row.variant_id)) {
      duplicateRows++
      validationErrors.push({ rowNumber, variantId: row.variant_id, reason: "duplicate variant row" })
    }
    if (row.variant_id) seen.add(row.variant_id)

    if (status === "NEEDS_REVIEW" || status === "") {
      needsReviewRows++
      continue
    }
    if (status === "REJECTED") {
      rejectedRows++
      continue
    }
    if (status !== "APPROVED") {
      invalidStatusRows++
      validationErrors.push({ rowNumber, variantId: row.variant_id, reason: `unsupported review_status '${status}'` })
      continue
    }

    const errors: string[] = []
    const amount = parseMajorAmount(row.proposed_usd_amount)
    const normalizedAmount = String(row.proposed_usd_amount || "").trim()
    const product = productById.get(row.product_id)
    const audit = auditByProductId.get(row.product_id)
    const variant = product?.variants?.find((candidate: any) => candidate.id === row.variant_id)
    if (!row.product_id) errors.push("missing product_id")
    if (!row.variant_id) errors.push("missing variant_id")
    if (!product) errors.push("product_id does not exist")
    if (product && !variant) errors.push("variant_id does not belong to product")
    if (variant && row.sku && String(variant.sku || "") !== row.sku) errors.push("SKU mismatch")
    if (!isPublishedDefaultChannelProduct(product)) errors.push("product is not published in Default Sales Channel")
    if (audit?.primary_classification === "storefrontClassificationExcluded") errors.push(`storefront classification excluded: ${audit.secondary_flags || "no reason recorded"}`)
    if (!row.proposed_usd_amount) errors.push("approved row is missing proposed_usd_amount")
    if (amount === null || amount <= 0) errors.push("proposed_usd_amount must be a positive major-unit number")
    if (normalizedAmount && PLACEHOLDER_AMOUNTS.has(normalizedAmount)) errors.push("proposed_usd_amount matches a prohibited placeholder value")
    if (amount !== null && amount < MIN_MAJOR_AMOUNT) errors.push("proposed_usd_amount is suspiciously low")
    if (amount !== null && amount > MAX_MAJOR_AMOUNT) errors.push("proposed_usd_amount is suspiciously high")
    const existingUsdPrices = allPricesForCurrency(variant, TARGET_CURRENCY)
    if (existingUsdPrices.length) {
      alreadyPricedRows++
      errors.push("variant already has a USD price")
    }
    const storeProduct = product ? await fetchStoreProduct(token, product.id) : null
    const storeVariant = storeProduct?.variants?.find((candidate: any) => candidate.id === row.variant_id)
    if (isValidCalculatedUsd(storeVariant)) errors.push("variant already has a valid USD calculated price")
    const priceSetId = variant ? await resolvePriceSetId(query, variant) : ""
    if (!priceSetId) errors.push("variant does not have a price set")

    if (errors.length) {
      validationErrors.push({ rowNumber, productId: row.product_id, variantId: variantKey, errors })
      continue
    }

    plannedCreates.push({
      rowNumber,
      productId: row.product_id,
      productHandle: row.product_handle,
      productTitle: row.product_title,
      variantId: row.variant_id,
      variantTitle: row.variant_title,
      priceSetId,
      currencyCode: TARGET_CURRENCY,
      amount,
    })
  }

  if (detectedPriceUnit === "mixed") {
    validationErrors.push({ reason: "mixed-unit proposed_usd_amount values detected" })
  }

  const approvedRows = rows.filter((row) => row.review_status === "APPROVED").length
  const validation = {
    totalRows: rows.length,
    approvedRows,
    needsReviewRows,
    rejectedRows,
    invalidRows: validationErrors.length + invalidStatusRows,
    duplicateRows,
    alreadyPricedRows,
    approvedVariants: plannedCreates.map((planned) => planned.variantId),
    rejectedVariants: validationErrors
      .filter((error) => Boolean(error.variantId))
      .map((error) => ({ variantId: error.variantId, reason: error.errors || error.reason })),
    approvedTotalAmountCount: plannedCreates.length,
    detectedPriceUnit,
    validationErrorsByRow: validationErrors,
    validForImport: approvedRows > 0 && detectedPriceUnit !== "mixed" && validationErrors.length === 0 && duplicateRows === 0,
  }
  fs.writeFileSync(VALIDATION_JSON, JSON.stringify(validation, null, 2) + "\n", "utf8")

  const exclusions = auditProducts
    .filter((product: any) => product.primary_classification === "storefrontClassificationExcluded")
    .map((product: any) => ({
      productId: product.product_id,
      handle: product.product_handle,
      title: product.product_title,
      primaryClassification: product.primary_classification,
      exactExclusionReason: product.secondary_flags || "storefront classification excluded",
      reviewCsvContainsRow: Array.from(reviewVariantIds).some((variantId) => rows.some((row) => row.variant_id === variantId && row.product_id === product.product_id)),
      preventedFromImport: true,
    }))
  fs.writeFileSync(EXCLUSIONS_JSON, JSON.stringify({ total: exclusions.length, exclusions }, null, 2) + "\n", "utf8")

  const dryRun = {
    status: approvedRows === 0 ? "NOT_RUN_NO_APPROVED_ROWS" : validation.validForImport ? "PASS" : "FAIL",
    approvedRowsExamined: approvedRows,
    variantsMatched: plannedCreates.length,
    priceSetsFound: plannedCreates.length,
    priceSetsNeedingCreation: 0,
    usdPricesToCreate: validation.validForImport ? plannedCreates.length : 0,
    rowsSkipped: needsReviewRows + rejectedRows,
    rowsRejected: validationErrors.length + invalidStatusRows,
    existingUsdPricesPreserved: snapshot.products.reduce((count: number, product: any) => count + product.variants.filter((variant: any) => variant.prices.some((price: any) => String(price.currency_code || "").toLowerCase() === TARGET_CURRENCY)).length, 0),
    cadPricesPreserved: snapshot.products.reduce((count: number, product: any) => count + product.variants.filter((variant: any) => variant.prices.some((price: any) => String(price.currency_code || "").toLowerCase() === "cad")).length, 0),
    estimatedUsaEligibleProductCountAfterImport: 15 + (validation.validForImport ? plannedCreates.length : 0),
    databaseWrites: 0,
    cadPricesChanged: 0,
    existingValidUsdPricesChanged: 0,
    productsChanged: 0,
    inventoryChanged: 0,
    plannedCreates,
  }
  fs.writeFileSync(DRY_RUN_JSON, JSON.stringify(dryRun, null, 2) + "\n", "utf8")

  const liveResult = {
    status: "NOT_RUN",
    reason: approvedRows === 0 ? "No rows have review_status exactly APPROVED." : "Validation or dry run did not pass.",
    livePricesCreated: 0,
    livePriceSetsCreated: 0,
    livePricesUpdated: 0,
    existingUsdPricesChanged: 0,
    cadPricesChanged: 0,
    businessDataWrites: 0,
  }

  if (apply) {
    if (!validation.validForImport) {
      throw new Error("Live import blocked: validation did not pass or no approved rows exist.")
    }
    let created = 0
    for (const planned of plannedCreates) {
      await pricing.createPrices([
        {
          price_set_id: planned.priceSetId,
          currency_code: TARGET_CURRENCY,
          amount: planned.amount,
        },
      ])
      created++
    }
    liveResult.status = "APPLIED"
    liveResult.reason = "Applied explicitly approved USD price rows."
    liveResult.livePricesCreated = created
    liveResult.businessDataWrites = created
  }
  fs.writeFileSync(LIVE_RESULT_JSON, JSON.stringify(liveResult, null, 2) + "\n", "utf8")

  const store = await fetchAllStoreProducts(token).catch((error) => ({
    products: [],
    statuses: [],
    count: 0,
    error: error instanceof Error ? error.message : String(error),
  }))
  logger.info("[APPROVED_USD_PRICE_IMPORT_VALIDATION]")
  logger.info(JSON.stringify({
    validation,
    dryRunStatus: dryRun.status,
    liveImportStatus: liveResult.status,
    storeApiStatuses: store.statuses,
    storeApiError: "error" in store ? store.error : undefined,
    businessDataWrites: liveResult.businessDataWrites,
  }, null, 2))
}
