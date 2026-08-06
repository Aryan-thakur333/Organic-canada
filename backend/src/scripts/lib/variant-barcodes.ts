import { createHash } from "crypto"
import * as fs from "fs"
import * as path from "path"
import { parseCsvLine } from "./approved-pos-csv"

export const BARCODE_AUDIT_HEADERS = [
  "product_id", "product_title", "product_status", "product_type", "variant_id", "variant_title", "sku",
  "existing_barcode", "existing_ean", "existing_upc", "inventory_item_id", "pos_sales_channel_linked",
  "classification", "suggested_internal_barcode", "approved_action", "approved_barcode", "notes",
] as const

export const APPROVED_BARCODE_ACTIONS = ["", "ASSIGN_INTERNAL_BARCODE", "KEEP_EXISTING", "SKIP", "MANUAL_REVIEW"] as const
export type ApprovedBarcodeAction = typeof APPROVED_BARCODE_ACTIONS[number]
export type BarcodeAuditRow = Record<typeof BARCODE_AUDIT_HEADERS[number], string>

export type CatalogVariant = {
  id: string
  title?: string | null
  sku?: string | null
  barcode?: string | null
  ean?: string | null
  upc?: string | null
  metadata?: Record<string, unknown> | null
  prices?: Array<{ amount: number; currency_code: string }>
  product?: {
    id: string
    title?: string | null
    handle?: string | null
    status?: string | null
    type?: { value?: string | null } | null
    metadata?: Record<string, unknown> | null
    sales_channels?: Array<{ id: string; name?: string | null }>
    vendor?: { id: string; name?: string | null } | null
  }
  inventory_items?: Array<{
    inventory_item_id: string
    inventory?: { location_levels?: Array<{ location_id: string; stocked_quantity: number; reserved_quantity: number }> }
  }>
}

export const VARIANT_BARCODE_GRAPH_FIELDS = [
  "id", "title", "sku", "barcode", "ean", "upc", "metadata", "prices.amount", "prices.currency_code",
  "product.id", "product.title", "product.handle", "product.status", "product.type.value", "product.metadata",
  "product.sales_channels.id", "product.sales_channels.name", "product.vendor.id", "product.vendor.name",
  "inventory_items.inventory_item_id", "inventory_items.inventory.location_levels.location_id",
  "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity",
] as const

export function isPosEligible(variant: CatalogVariant): boolean {
  return variant.product?.status === "published" && Boolean(variant.product.sales_channels?.some((channel) => String(channel.name || "").toUpperCase() === "POS"))
}

export function normalizeIdentifier(value: unknown): string {
  return String(value ?? "").trim()
}

export function validateInternalBarcode(value: unknown): string[] {
  const barcode = normalizeIdentifier(value)
  const errors: string[] = []
  if (!barcode) errors.push("barcode is required")
  if (barcode.length > 64) errors.push("barcode must be at most 64 characters")
  if (!/^[A-Z0-9-]+$/.test(barcode)) errors.push("internal barcode may contain only A-Z, 0-9, and hyphen")
  if (/^[=+@-]/.test(barcode)) errors.push("barcode begins with an unsafe spreadsheet formula character")
  return errors
}

export function isValidGtinChecksum(value: unknown, allowedLengths = [8, 12, 13, 14]): boolean {
  const code = normalizeIdentifier(value)
  if (!allowedLengths.includes(code.length) || !/^\d+$/.test(code)) return false
  const digits = [...code].map(Number)
  const check = digits.pop() as number
  let sum = 0
  for (let index = digits.length - 1, position = 0; index >= 0; index--, position++) {
    sum += digits[index] * (position % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10 === check
}

function token(value: unknown, fallback: string, max = 14): string {
  const clean = String(value || "").normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase()
  return (clean || fallback).slice(0, max).replace(/-+$/g, "") || fallback
}

export function suggestInternalBarcode(variant: CatalogVariant): string {
  const category = token(variant.product?.type?.value || variant.product?.metadata?.category, "GEN", 3)
  const product = token(variant.product?.handle || variant.product?.id, "PRODUCT", 14)
  const option = token(variant.title, "DEFAULT", 12)
  const stable = createHash("sha256").update(String(variant.id)).digest("hex").slice(0, 8).toUpperCase()
  return `EAT-${category}-${product}-${option}-${stable}`
}

export function classifyVariant(variant: CatalogVariant, barcodeCounts: Map<string, number>, skuCounts: Map<string, number>): string {
  const barcode = normalizeIdentifier(variant.barcode)
  const sku = normalizeIdentifier(variant.sku)
  const ean = normalizeIdentifier(variant.ean)
  const upc = normalizeIdentifier(variant.upc)
  if (!isPosEligible(variant)) return "NOT_POS_ELIGIBLE"
  if (barcode && barcodeCounts.get(barcode) && Number(barcodeCounts.get(barcode)) > 1) return "DUPLICATE_BARCODE"
  if (sku && skuCounts.get(sku) && Number(skuCounts.get(sku)) > 1) return "DUPLICATE_SKU"
  if (barcode && (barcode.length > 128 || /[\u0000-\u001f\u007f]/.test(barcode))) return "INVALID_BARCODE"
  if (ean && !isValidGtinChecksum(ean, [8, 13, 14])) return "INVALID_BARCODE"
  if (upc && !isValidGtinChecksum(upc, [12])) return "INVALID_BARCODE"
  if (ean) return "EAN_PRESENT"
  if (upc) return "UPC_PRESENT"
  if (barcode) return "BARCODE_PRESENT"
  if (sku) return "SKU_ONLY"
  return "ALL_IDENTIFIERS_MISSING"
}

function spreadsheetSafe(value: unknown): string {
  const text = String(value ?? "")
  return /^[=+@-]/.test(text) ? `'${text}` : text
}

function csvCell(value: unknown): string {
  const text = spreadsheetSafe(value).replace(/"/g, '""')
  return `"${text}"`
}

export function writeBarcodeAuditCsv(filePath: string, rows: BarcodeAuditRow[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const content = [BARCODE_AUDIT_HEADERS.join(","), ...rows.map((row) => BARCODE_AUDIT_HEADERS.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n"
  fs.writeFileSync(filePath, content, "utf8")
}

export function readBarcodeAuditCsv(filePath: string): BarcodeAuditRow[] {
  if (!fs.existsSync(filePath)) return []
  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return []
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase())
  const missing = BARCODE_AUDIT_HEADERS.filter((header) => !headers.includes(header))
  if (missing.length) throw new Error(`Barcode audit CSV is missing headers: ${missing.join(", ")}`)
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(BARCODE_AUDIT_HEADERS.map((header) => [header, String(values[headers.indexOf(header)] ?? "").trim()])) as BarcodeAuditRow
  })
}

export function buildAuditRows(variants: CatalogVariant[], preservedRows: BarcodeAuditRow[] = []): BarcodeAuditRow[] {
  const barcodeCounts = new Map<string, number>()
  const skuCounts = new Map<string, number>()
  for (const variant of variants) {
    const barcode = normalizeIdentifier(variant.barcode)
    const sku = normalizeIdentifier(variant.sku)
    if (barcode) barcodeCounts.set(barcode, (barcodeCounts.get(barcode) || 0) + 1)
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1)
  }
  const preserved = new Map(preservedRows.map((row) => [row.variant_id, row]))
  const suggestions = new Set<string>()
  return variants.map((variant) => {
    const previous = preserved.get(variant.id)
    const eligibleForSuggestion = isPosEligible(variant) && !normalizeIdentifier(variant.barcode) && !normalizeIdentifier(variant.ean) && !normalizeIdentifier(variant.upc)
    const generated = eligibleForSuggestion ? suggestInternalBarcode(variant) : ""
    const preservedSuggestion = previous?.suggested_internal_barcode && !suggestions.has(previous.suggested_internal_barcode)
      ? previous.suggested_internal_barcode
      : ""
    const suggestion = preservedSuggestion || generated
    if (suggestion) suggestions.add(suggestion)
    return {
      product_id: String(variant.product?.id || ""),
      product_title: String(variant.product?.title || ""),
      product_status: String(variant.product?.status || ""),
      product_type: String(variant.product?.type?.value || ""),
      variant_id: variant.id,
      variant_title: String(variant.title || ""),
      sku: normalizeIdentifier(variant.sku),
      existing_barcode: normalizeIdentifier(variant.barcode),
      existing_ean: normalizeIdentifier(variant.ean),
      existing_upc: normalizeIdentifier(variant.upc),
      inventory_item_id: (variant.inventory_items || []).map((item) => item.inventory_item_id).filter(Boolean).join("|"),
      pos_sales_channel_linked: isPosEligible(variant) ? "true" : "false",
      classification: classifyVariant(variant, barcodeCounts, skuCounts),
      suggested_internal_barcode: suggestion,
      approved_action: previous?.approved_action || "",
      approved_barcode: previous?.approved_barcode || "",
      notes: previous?.notes || "",
    }
  }).sort((a, b) => a.product_title.localeCompare(b.product_title) || a.variant_title.localeCompare(b.variant_title) || a.variant_id.localeCompare(b.variant_id))
}
