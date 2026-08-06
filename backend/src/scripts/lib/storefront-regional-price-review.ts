import * as fs from "fs"
import { parse } from "csv-parse/sync"

export const REVIEW_HEADERS = [
  "product_id", "product_title", "product_handle", "variant_id", "variant_title", "product_type", "category",
  "current_usd", "current_cad", "usd_status", "cad_status", "review_flags", "suggested_usd", "suggested_cad",
  "approved_usd", "approved_cad", "merchant_notes", "approved",
]
export const HIGH_PRICE_REVIEW_THRESHOLD = 500
const TEST_OR_DEBUG = /\btest\b|\be2e\b|debug|codex verification|cad-only|usd-only|empty file|browser test|smoke test/i

export type ReviewRow = Record<(typeof REVIEW_HEADERS)[number], string>

export function csvEscape(value: unknown) {
  const text = String(value ?? "")
  const escaped = text.replace(/"/g, '""')
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}

export function isTestOrDebugProduct(product: any) {
  const metadata = product?.metadata || {}
  return metadata.storefront_visibility === "hidden"
    || metadata.catalog_classification === "test_or_debug_product"
    || TEST_OR_DEBUG.test(`${product?.title || ""} ${product?.handle || ""}`)
}

export function pricesForCurrency(variant: any, currency: string) {
  return (variant?.prices || []).filter((price: any) => String(price?.currency_code || "").toLowerCase() === currency)
}

export function firstAmount(prices: any[]) {
  const price = prices[0]
  return price && Number.isFinite(Number(price.amount)) ? String(price.amount) : ""
}

export function priceFlags(variant: any, currency: "usd" | "cad") {
  const prices = pricesForCurrency(variant, currency)
  const upper = currency.toUpperCase()
  const amounts = prices.map((price: any) => Number(price.amount)).filter(Number.isFinite)
  const flags: string[] = []
  if (!prices.length) flags.push(`MISSING_${upper}`)
  if (amounts.some((amount) => amount <= 0)) flags.push(`ZERO_${upper}`)
  if (amounts.some((amount) => amount >= HIGH_PRICE_REVIEW_THRESHOLD)) flags.push(`HIGH_${upper}_REVIEW`)
  if (prices.length > 1) flags.push(`DUPLICATE_${upper}_PRICE`)
  return flags
}

export function parseApprovedAmount(value: string) {
  const text = String(value ?? "").trim()
  if (!text) return { value: null, reason: null }
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text)) return { value: null, reason: "must be a major-unit decimal with no currency symbol, comma, scaling, or FX notation" }
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount <= 0) return { value: null, reason: "must be a finite major-unit amount greater than zero" }
  return { value: amount, reason: null }
}

export function readReviewCsv(filePath: string) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")
  const rows = parse(text, {
    columns: (headers: string[]) => headers.map((header) => header.replace(/^\uFEFF/, "").trim()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
  }) as ReviewRow[]
  const headers = Object.keys(rows[0] || {})
  const missing = REVIEW_HEADERS.filter((header) => !headers.includes(header))
  if (missing.length) throw new Error(`Missing required CSV headers: ${missing.join(", ")}. Detected headers: ${headers.join(", ")}`)
  return rows.map((row) => Object.fromEntries(REVIEW_HEADERS.map((header) => [header, String(row[header] ?? "").trim()])) as ReviewRow)
}

export function writeReviewCsv(filePath: string, rows: ReviewRow[]) {
  fs.writeFileSync(filePath, `${[REVIEW_HEADERS.join(","), ...rows.map((row) => REVIEW_HEADERS.map((header) => csvEscape(row[header])).join(","))].join("\n")}\n`, "utf8")
}
