import * as fs from "fs"
import * as path from "path"
import { parse } from "csv-parse/sync"
import { APPROVAL_HEADERS, csvEscape, MerchantRegionalPriceCsvRow } from "./merchant-regional-prices"

const SOURCE_HEADERS = APPROVAL_HEADERS.filter((header) => header !== "merchant_note")
const TARGETS: Record<string, { approvedCad: string; approvedUsd: string; handle: string }> = {
  variant_01KXJNH5ASR8XNZ9QSW29B8SJ7: { approvedCad: "22", approvedUsd: "16.99", handle: "chocolate-mrly26sk" },
  variant_01KVSFB75GZJ4N0B9SY6BXDTZC: { approvedCad: "4.99", approvedUsd: "3.99", handle: "organic-apples" },
  variant_01KWW11NCJY9SGGGPJ5D7WB4FR: { approvedCad: "25", approvedUsd: "18.99", handle: "organic-oil-mr9drod0" },
}

export interface RegenerationResult { sourceDelimiter: "tab" | "comma"; sourceHeaders: string[]; merchantNoteWasMissing: boolean; totalRows: number; approvedRows: number; pendingRows: number; backupPath: string; outputPath: string }

function normalizeHeaders(headers: string[]) { return headers.map((header) => String(header).replace(/^\uFEFF/, "").trim().toLowerCase()) }
function detectDelimiter(firstLine: string): "\t" | "," { return firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : "," }
function stamp() { const now = new Date(); return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}` }

export function parseRegenerationSource(text: string) {
  const clean = text.replace(/^\uFEFF/, ""), firstLine = clean.split(/\r?\n/, 1)[0] || "", delimiter = detectDelimiter(firstLine)
  const headers = normalizeHeaders(parse(firstLine, { delimiter, trim: true, relax_column_count: false })[0] || [])
  const missing = SOURCE_HEADERS.filter((header) => !headers.includes(header))
  if (missing.length) throw new Error(`Missing required source headers: ${missing.join(", ")}. Detected headers: ${headers.join(", ")}`)
  const records = parse(clean, { delimiter, columns: (source: string[]) => normalizeHeaders(source), skip_empty_lines: true, trim: true, relax_column_count: false }) as Record<string, string>[]
  const rows = records.map((record): MerchantRegionalPriceCsvRow => ({
    product_id: String(record.product_id ?? "").trim(),
    product_handle: String(record.product_handle ?? "").trim(),
    product_title: String(record.product_title ?? "").trim(),
    variant_id: String(record.variant_id ?? "").trim(),
    variant_title: String(record.variant_title ?? "").trim(),
    current_cad_price: String(record.current_cad_price ?? "").trim(),
    approved_cad_price: String(record.approved_cad_price ?? "").trim(),
    current_usd_price: String(record.current_usd_price ?? "").trim(),
    approved_usd_price: String(record.approved_usd_price ?? "").trim(),
    approval_status: String(record.approval_status ?? "").trim(),
    merchant_note: String(record.merchant_note ?? "").trim(),
  }))
  return { delimiter: delimiter === "\t" ? "tab" as const : "comma" as const, headers, merchantNoteWasMissing: !headers.includes("merchant_note"), rows }
}

export function prepareRegeneratedRows(rows: MerchantRegionalPriceCsvRow[]) {
  const seen = new Set<string>(); let approved = 0
  const normalized = rows.map((row, index) => {
    if (!row.product_id || !row.product_handle || !row.variant_id) throw new Error(`Source row ${index + 2} is missing product_id, product_handle, or variant_id`)
    if (seen.has(row.variant_id)) throw new Error(`Duplicate variant_id '${row.variant_id}' in source`) 
    seen.add(row.variant_id)
    const status = String(row.approval_status || "").trim().toLowerCase()
    if (!status || !["pending", "approved", "review", "rejected"].includes(status)) throw new Error(`Invalid approval_status '${row.approval_status}' for variant '${row.variant_id}'`)
    const target = TARGETS[row.variant_id]
    const next = { ...row, approval_status: status, merchant_note: row.merchant_note || "" }
    if (target) {
      if (next.product_handle !== target.handle) throw new Error(`Target handle mismatch for '${row.variant_id}'`)
      next.approved_cad_price = target.approvedCad; next.approved_usd_price = target.approvedUsd; next.approval_status = "approved"; next.merchant_note = "Testing approved CAD and USD price"
    }
    if (next.approval_status === "approved") approved++
    return next
  })
  if (normalized.length !== 147) throw new Error(`Expected 147 source rows; found ${normalized.length}`)
  if (approved !== 3) throw new Error(`Expected exactly 3 approved rows; found ${approved}`)
  return normalized
}

export function validateGeneratedCsv(text: string) {
  const parsed = parseRegenerationSource(text)
  if (parsed.delimiter !== "comma" || parsed.headers.join(",") !== APPROVAL_HEADERS.join(",")) throw new Error("Generated CSV does not have the exact required comma-delimited header")
  const rows = prepareRegeneratedRows(parsed.rows)
  if (rows.filter((row) => row.approval_status === "pending").length !== 144) throw new Error("Generated CSV does not contain 144 pending rows")
  return rows
}

export function regenerateMerchantRegionalPricesCsv(sourcePath: string): RegenerationResult {
  const sourceText = fs.readFileSync(sourcePath, "utf8"), source = parseRegenerationSource(sourceText), rows = prepareRegeneratedRows(source.rows)
  const outputText = [APPROVAL_HEADERS.join(","), ...rows.map((row) => APPROVAL_HEADERS.map((header) => csvEscape(row[header as keyof MerchantRegionalPriceCsvRow])).join(","))].join("\n") + "\n"
  const temporaryPath = `${sourcePath}.tmp`; fs.writeFileSync(temporaryPath, outputText, "utf8")
  try { validateGeneratedCsv(fs.readFileSync(temporaryPath, "utf8")) } catch (error) { fs.rmSync(temporaryPath, { force: true }); throw error }
  const backupDir = path.join(path.dirname(sourcePath), "backups"); fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `merchant-approved-regional-prices-before-regeneration-${stamp()}.csv`)
  if (fs.existsSync(backupPath)) { fs.rmSync(temporaryPath, { force: true }); throw new Error(`Backup already exists: ${backupPath}`) }
  fs.renameSync(sourcePath, backupPath)
  try { fs.renameSync(temporaryPath, sourcePath) } catch (error) { fs.renameSync(backupPath, sourcePath); throw error }
  return { sourceDelimiter: source.delimiter, sourceHeaders: source.headers, merchantNoteWasMissing: source.merchantNoteWasMissing, totalRows: rows.length, approvedRows: 3, pendingRows: 144, backupPath, outputPath: sourcePath }
}
