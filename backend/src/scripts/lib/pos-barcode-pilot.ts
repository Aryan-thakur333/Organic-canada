import * as fs from "fs"
import * as path from "path"
import { parseCsvLine } from "./approved-pos-csv"
import { normalizeIdentifier, suggestInternalBarcode, validateInternalBarcode, type CatalogVariant } from "./variant-barcodes"

export const POS_BARCODE_PILOT_TITLES = [
  "Fresh Bananas",
  "Organic Apples",
  "Organic Carrots",
  "Organic Milk",
  "Whole Wheat Bread",
] as const

export const PILOT_APPROVAL_HEADERS = [
  "product_id", "product_title", "variant_id", "variant_title", "sku", "existing_barcode",
  "suggested_internal_barcode", "approved_action", "approved_barcode", "pos_sales_channel_linked",
  "canada_price_available", "usa_price_available", "canada_inventory_available",
  "usa_inventory_available", "approval_status", "notes",
] as const

export type PilotClassification =
  | "ELIGIBLE" | "ALREADY_LINKED" | "INELIGIBLE_STATUS" | "INELIGIBLE_TYPE"
  | "MISSING_VARIANT" | "MISSING_PRICE" | "MISSING_INVENTORY_LINK" | "MANUAL_REVIEW"

export type PilotRegister = {
  id: string
  name?: string
  sales_channel_id: string
  stock_location_id: string
  region_id: string
  currency_code: string
  status?: string
}

export type PilotProduct = {
  id: string
  title?: string | null
  handle?: string | null
  status?: string | null
  deleted_at?: string | null
  metadata?: Record<string, unknown> | null
  type?: { value?: string | null } | null
  collection?: { id?: string; title?: string | null } | null
  shipping_profile?: { id?: string } | null
  shipping_profile_id?: string | null
  sales_channels?: Array<{ id: string; name?: string | null }>
  vendor?: { id?: string; name?: string | null } | null
  variants?: PilotVariant[]
}

export type PilotVariant = Omit<CatalogVariant, "product"> & {
  deleted_at?: string | null
  manage_inventory?: boolean
  allow_backorder?: boolean
  product?: PilotProduct
}

export type PilotDecision = {
  title: string
  resolved: boolean
  classification: PilotClassification | "UNRESOLVED"
  reasons: string[]
  product?: PilotProduct
  variants: PilotVariant[]
  alreadyLinked: boolean
  canadaPriceAvailable: boolean
  usaPriceAvailable: boolean
  canadaInventoryAvailable: boolean
  usaInventoryAvailable: boolean
  canadaInventoryLinked: boolean
  usaInventoryLinked: boolean
  vendorOwnership: string
  physical: boolean
}

export type PilotApprovalRow = Record<typeof PILOT_APPROVAL_HEADERS[number], string>

const TEST_OR_SUSPICIOUS = /\b(test|debug|fixture|sample|dummy|fake|sandbox|e2e|smoke)\b/i
const truthy = (value: unknown) => value === true || String(value || "").toLowerCase() === "true"
const lower = (value: unknown) => String(value || "").trim().toLowerCase()

export function isPhysicalPilotProduct(product: PilotProduct): boolean {
  const metadata = product.metadata || {}
  const kind = lower(metadata.product_type || product.type?.value)
  return !truthy(metadata.is_digital) && !truthy(metadata.digital_product) && kind !== "digital" && kind !== "digital product"
}

export function isSuspiciousPilotProduct(product: PilotProduct): boolean {
  const metadata = product.metadata || {}
  return TEST_OR_SUSPICIOUS.test(`${product.title || ""} ${product.handle || ""}`)
    || lower(metadata.catalog_classification) === "test_or_debug_product"
    || lower(metadata.storefront_visibility) === "hidden"
    || truthy(metadata.catalog_removal_pending)
    || truthy(metadata.security_hold)
    || truthy(metadata.catalog_hold)
}

function priceAvailable(variant: PilotVariant, currency: string) {
  return Boolean(variant.prices?.some((price) => lower(price.currency_code) === currency && Number.isFinite(Number(price.amount)) && Number(price.amount) > 0))
}

function inventoryAt(variant: PilotVariant, locationId: string) {
  const items = variant.inventory_items || []
  const levels = items.flatMap((item) => item.inventory?.location_levels || []).filter((level) => level.location_id === locationId)
  const stocked = levels.reduce((sum, level) => sum + Number(level.stocked_quantity || 0), 0)
  const reserved = levels.reduce((sum, level) => sum + Number(level.reserved_quantity || 0), 0)
  return { linked: variant.manage_inventory === false || (items.length > 0 && levels.length > 0), available: variant.manage_inventory === false || variant.allow_backorder === true || stocked - reserved > 0 }
}

export function classifyPilotProducts(products: PilotProduct[], posChannelId: string, registers: PilotRegister[], unsafePriceProductIds: ReadonlySet<string> = new Set()): PilotDecision[] {
  const cad = registers.find((register) => lower(register.currency_code) === "cad" && register.sales_channel_id === posChannelId)
  const usd = registers.find((register) => lower(register.currency_code) === "usd" && register.sales_channel_id === posChannelId)
  return POS_BARCODE_PILOT_TITLES.map((title) => {
    const exact = products.filter((product) => product.title === title)
    if (exact.length !== 1) {
      return { title, resolved: false, classification: "UNRESOLVED", reasons: [exact.length ? "multiple exact-title products found" : "exact product title not found"], variants: [], alreadyLinked: false, canadaPriceAvailable: false, usaPriceAvailable: false, canadaInventoryAvailable: false, usaInventoryAvailable: false, canadaInventoryLinked: false, usaInventoryLinked: false, vendorOwnership: "", physical: false }
    }
    const product = exact[0]
    const variants = (product.variants || []).filter((variant) => !variant.deleted_at)
    const linked = Boolean(product.sales_channels?.some((channel) => channel.id === posChannelId))
    const physical = isPhysicalPilotProduct(product)
    const cadPrice = variants.length > 0 && variants.every((variant) => priceAvailable(variant, "cad"))
    const usdPrice = variants.length > 0 && variants.every((variant) => priceAvailable(variant, "usd"))
    const cadInventory = cad ? variants.map((variant) => inventoryAt(variant, cad.stock_location_id)) : []
    const usdInventory = usd ? variants.map((variant) => inventoryAt(variant, usd.stock_location_id)) : []
    const cadLinked = Boolean(cad && cadInventory.length && cadInventory.every((entry) => entry.linked))
    const usdLinked = Boolean(usd && usdInventory.length && usdInventory.every((entry) => entry.linked))
    const cadAvailable = Boolean(cad && cadInventory.length && cadInventory.every((entry) => entry.available))
    const usdAvailable = Boolean(usd && usdInventory.length && usdInventory.every((entry) => entry.available))
    const metadataOwner = normalizeIdentifier(product.metadata?.vendor_id)
    const relationOwner = normalizeIdentifier(product.vendor?.id)
    const owner = relationOwner || metadataOwner || "PLATFORM"
    const reasons: string[] = []
    let classification: PilotClassification
    if (product.deleted_at || product.status !== "published") {
      classification = "INELIGIBLE_STATUS"; reasons.push("product is not an active published product")
    } else if (!physical) {
      classification = "INELIGIBLE_TYPE"; reasons.push("product is digital or non-physical")
    } else if (!variants.length) {
      classification = "MISSING_VARIANT"; reasons.push("no active variant exists")
    } else if (variants.some((variant) => variant.manage_inventory !== false && !(variant.inventory_items || []).length)) {
      classification = "MISSING_INVENTORY_LINK"; reasons.push("an inventory-managed variant has no inventory item")
    } else if (!cad || !cadPrice) {
      classification = "MISSING_PRICE"; reasons.push("a safe positive CAD price is unavailable for the Canada POS register")
    } else if (!cadLinked) {
      classification = "MISSING_INVENTORY_LINK"; reasons.push("Canada register-location inventory link is missing")
    } else if (unsafePriceProductIds.has(product.id)) {
      classification = "MANUAL_REVIEW"; reasons.push("current CAD amount matches an unresolved suspicious minor-unit seed and requires merchant price approval")
    } else if (isSuspiciousPilotProduct(product)) {
      classification = "MANUAL_REVIEW"; reasons.push("catalog/test/security metadata requires manual review")
    } else if (relationOwner && metadataOwner && relationOwner !== metadataOwner) {
      classification = "MANUAL_REVIEW"; reasons.push("vendor ownership sources conflict")
    } else if (linked) {
      classification = "ALREADY_LINKED"; reasons.push("product is already linked to the configured POS sales channel")
    } else {
      classification = "ELIGIBLE"; reasons.push("published physical product with safe CAD price and Canada inventory link")
    }
    if (!usdPrice) reasons.push("USA price unavailable; USA sale readiness is not claimed")
    if (!usdLinked) reasons.push("USA inventory link unavailable; no cross-region fallback is allowed")
    else if (!usdAvailable) reasons.push("USA inventory is out of stock; USA sale readiness is not claimed")
    if (cadLinked && !cadAvailable) reasons.push("Canada inventory is currently out of stock")
    return { title, resolved: true, classification, reasons, product, variants, alreadyLinked: linked, canadaPriceAvailable: cadPrice, usaPriceAvailable: usdPrice, canadaInventoryAvailable: cadAvailable, usaInventoryAvailable: usdAvailable, canadaInventoryLinked: cadLinked, usaInventoryLinked: usdLinked, vendorOwnership: owner, physical }
  })
}

export function unresolvedSuspiciousCadPriceProductIds(filePath: string, products: PilotProduct[]): Set<string> {
  if (!fs.existsSync(filePath)) return new Set()
  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return new Set()
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase())
  const index = (name: string) => headers.indexOf(name)
  const currentByProduct = new Map(products.map((product) => [product.id, (product.variants || []).flatMap((variant) => variant.prices || []).filter((price) => lower(price.currency_code) === "cad").map((price) => Number(price.amount))]))
  const unsafe = new Set<string>()
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line)
    const productId = String(values[index("product_id")] || "").trim()
    const stored = Number(values[index("stored_cad_price")])
    const approved = String(values[index("approved_corrected_cad_price")] || "").trim()
    const status = lower(values[index("status")])
    if (productId && status === "suspicious_needs_review" && !approved && Number.isFinite(stored) && currentByProduct.get(productId)?.some((amount) => amount === stored)) unsafe.add(productId)
  }
  return unsafe
}

function spreadsheetSafe(value: unknown) {
  const text = String(value ?? "")
  return /^[=+@-]/.test(text) ? `'${text}` : text
}

function cell(value: unknown) {
  return `"${spreadsheetSafe(value).replace(/"/g, '""')}"`
}

export function buildPilotApprovalRows(decisions: PilotDecision[]): PilotApprovalRow[] {
  const seen = new Set<string>()
  const rows: PilotApprovalRow[] = []
  for (const decision of decisions) {
    if (!decision.resolved || !["ELIGIBLE", "ALREADY_LINKED"].includes(decision.classification)) continue
    for (const variant of decision.variants) {
      const existing = normalizeIdentifier(variant.barcode)
      const hasOfficial = normalizeIdentifier(variant.upc) || normalizeIdentifier(variant.ean)
      const suggestion = !existing && !hasOfficial ? suggestInternalBarcode({ ...variant, product: decision.product } as CatalogVariant) : ""
      const errors = suggestion ? validateInternalBarcode(suggestion) : []
      const duplicate = Boolean(suggestion && seen.has(suggestion))
      if (suggestion) seen.add(suggestion)
      const approved = Boolean(suggestion && !errors.length && !duplicate)
      rows.push({
        product_id: decision.product?.id || "", product_title: decision.title, variant_id: variant.id,
        variant_title: String(variant.title || ""), sku: normalizeIdentifier(variant.sku), existing_barcode: existing,
        suggested_internal_barcode: suggestion, approved_action: approved ? "ASSIGN_INTERNAL_BARCODE" : "",
        approved_barcode: approved ? suggestion : "", pos_sales_channel_linked: decision.alreadyLinked ? "true" : "false",
        canada_price_available: String(decision.canadaPriceAvailable), usa_price_available: String(decision.usaPriceAvailable),
        canada_inventory_available: String(decision.canadaInventoryAvailable), usa_inventory_available: String(decision.usaInventoryAvailable),
        approval_status: approved ? "PILOT_APPROVED" : existing || hasOfficial ? "EXISTING_IDENTIFIER" : "BLOCKED",
        notes: decision.reasons.join("; "),
      })
    }
  }
  return rows
}

export function writePilotApprovalCsv(filePath: string, rows: PilotApprovalRow[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, [PILOT_APPROVAL_HEADERS.join(","), ...rows.map((row) => PILOT_APPROVAL_HEADERS.map((header) => cell(row[header])).join(","))].join("\n") + "\n", "utf8")
}

export function readPilotApprovalCsv(filePath: string): PilotApprovalRow[] {
  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim())
  const headers = parseCsvLine(lines[0] || "").map((header) => header.trim().toLowerCase())
  const missing = PILOT_APPROVAL_HEADERS.filter((header) => !headers.includes(header))
  if (missing.length) throw new Error(`Pilot approval CSV is missing headers: ${missing.join(", ")}`)
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(PILOT_APPROVAL_HEADERS.map((header) => [header, String(values[headers.indexOf(header)] ?? "").trim()])) as PilotApprovalRow
  })
}
