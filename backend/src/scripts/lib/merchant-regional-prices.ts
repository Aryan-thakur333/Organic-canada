import * as fs from "fs"
import * as path from "path"
import { parse } from "csv-parse/sync"

export const PRODUCTION_SALES_CHANNEL_ID = "sc_01KVJF9HK0YY92JES8P7VPZN12"
export const APPROVAL_STATUSES = new Set(["pending", "approved", "rejected", "review"])
export const APPROVAL_HEADERS = [
  "product_id", "product_handle", "product_title", "variant_id", "variant_title",
  "current_cad_price", "approved_cad_price", "current_usd_price", "approved_usd_price",
  "approval_status", "merchant_note",
]

export interface MerchantRegionalPriceCsvRow {
  product_id: string; product_handle: string; product_title: string; variant_id: string; variant_title: string
  current_cad_price: string; approved_cad_price: string; current_usd_price: string; approved_usd_price: string
  approval_status: string; merchant_note: string
}

export interface MerchantRegionalPriceRow {
  rowNumber: number; productId: string; productHandle: string; productTitle: string; variantId: string; variantTitle: string
  currentCadPrice: string; approvedCadPrice: string; currentUsdPrice: string; approvedUsdPrice: string; approvalStatus: string; merchantNote: string
}

export interface RowIssue { rowNumber: number; productId: string; productHandle: string; variantId: string; reason: string }

export function formatRowValidation(rowIssues: RowIssue[], hasAction: boolean): string {
  if (hasAction) return "VALID"
  return rowIssues.length ? rowIssues.map((issue) => issue.reason).join("; ") : "SKIP"
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? ""); const escaped = text.replace(/"/g, '""')
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}

export function mapMerchantRegionalPriceCsvRow(row: MerchantRegionalPriceCsvRow, rowNumber: number): MerchantRegionalPriceRow {
  return {
    rowNumber, productId: row.product_id?.trim() ?? "", productHandle: row.product_handle?.trim() ?? "", productTitle: row.product_title?.trim() ?? "",
    variantId: row.variant_id?.trim() ?? "", variantTitle: row.variant_title?.trim() ?? "", currentCadPrice: row.current_cad_price?.trim() ?? "",
    approvedCadPrice: row.approved_cad_price?.trim() ?? "", currentUsdPrice: row.current_usd_price?.trim() ?? "", approvedUsdPrice: row.approved_usd_price?.trim() ?? "",
    approvalStatus: row.approval_status?.trim().toLowerCase() ?? "", merchantNote: row.merchant_note?.trim() ?? "",
  }
}

export function readMerchantApprovalCsv(csvPath: string): { headers: string[]; rows: MerchantRegionalPriceRow[] } {
  const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "")
  const firstLine = text.split(/\r?\n/, 1)[0] || ""
  const detectedDelimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ","
  const headers = parse(firstLine, { delimiter: detectedDelimiter, trim: true, relax_column_count: false })[0]?.map((header: string) => header.replace(/^\uFEFF/, "").trim().toLowerCase()) || []
  const missingHeaders = APPROVAL_HEADERS.filter((header) => !headers.includes(header))
  if (missingHeaders.length) throw new Error(`Missing required CSV headers: ${missingHeaders.join(", ")}. Detected headers: ${headers.join(", ")}. Detected delimiter: ${detectedDelimiter === "\t" ? "tab" : "comma"}; expected comma.`)
  const records = parse(text, { columns: (source: string[]) => source.map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase()), skip_empty_lines: true, trim: true, relax_column_count: false }) as MerchantRegionalPriceCsvRow[]
  return { headers, rows: records.map((record, index) => mapMerchantRegionalPriceCsvRow(record, index + 2)) }
}

export function writeMerchantApprovalCsv(csvPath: string, rows: MerchantRegionalPriceRow[]) {
  fs.mkdirSync(path.dirname(csvPath), { recursive: true })
  const toCsv = (row: MerchantRegionalPriceRow): MerchantRegionalPriceCsvRow => ({ product_id: row.productId, product_handle: row.productHandle, product_title: row.productTitle, variant_id: row.variantId, variant_title: row.variantTitle, current_cad_price: row.currentCadPrice, approved_cad_price: row.approvedCadPrice, current_usd_price: row.currentUsdPrice, approved_usd_price: row.approvedUsdPrice, approval_status: row.approvalStatus, merchant_note: row.merchantNote })
  fs.writeFileSync(csvPath, [APPROVAL_HEADERS.join(","), ...rows.map((row) => { const csvRow = toCsv(row); return APPROVAL_HEADERS.map((key) => csvEscape(csvRow[key as keyof MerchantRegionalPriceCsvRow])).join(",") })].join("\n") + "\n", "utf8")
}

export function parseMajorAmount(value: string): number | null {
  const text = String(value || "").trim()
  if (!text || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text)) return null
  const amount = Number(text)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function hasUnsafeAmountSyntax(value: string) {
  return /[$€£,]|nan|infinity/i.test(String(value || ""))
}

export async function resolvePriceSetId(query: any, variant: any): Promise<string> {
  const direct = (variant.prices || []).find((price: any) => price.price_set_id)?.price_set_id
  if (direct) return direct
  const { data } = await query.graph({ entity: "product_variant_price_set", fields: ["variant_id", "price_set_id"], filters: { variant_id: variant.id } })
  return (data || []).find((link: any) => link.price_set_id)?.price_set_id || ""
}

export function priceForCurrency(variant: any, currency: string) {
  return (variant.prices || []).find((price: any) => String(price.currency_code || "").toLowerCase() === currency)
}
