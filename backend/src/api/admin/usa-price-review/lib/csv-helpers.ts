/**
 * CSV helpers shared by USA price review admin API.
 * All file I/O uses atomic replacement to prevent corruption.
 */
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

export const csvFs = {
  existsSync: fs.existsSync,
  mkdirSync: fs.mkdirSync,
  writeFileSync: fs.writeFileSync,
  renameSync: fs.renameSync,
  copyFileSync: fs.copyFileSync,
  unlinkSync: fs.unlinkSync,
  readFileSync: fs.readFileSync,
}

export function resolvePriceReviewProjectRoot(
  cwd = process.cwd(),
  configuredRoot = process.env.EATSIE_PROJECT_ROOT,
): string {
  const candidate = configuredRoot?.trim()
  return candidate && path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(cwd)
}

export const PRICE_REVIEW_PROJECT_ROOT = resolvePriceReviewProjectRoot()
export const REPORTS_DIR = path.resolve(PRICE_REVIEW_PROJECT_ROOT, "reports")
export const REVIEW_CSV = path.resolve(REPORTS_DIR, "usa-missing-usd-price-review.csv")

/** Valid review statuses */
export const VALID_STATUSES = new Set(["NEEDS_REVIEW", "APPROVED", "REJECTED"])
export type ReviewStatus = "NEEDS_REVIEW" | "APPROVED" | "REJECTED"

/** CSV column names (canonical order must match write) */
export const CSV_HEADERS = [
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
] as const

export type CsvHeader = (typeof CSV_HEADERS)[number]
export type ReviewRow = Record<CsvHeader, string>

/** Immutable fields that can never be changed via PATCH */
export const IMMUTABLE_FIELDS: ReadonlySet<CsvHeader> = new Set([
  "product_id",
  "product_handle",
  "product_title",
  "variant_id",
  "variant_title",
  "sku",
  "current_cad_amount",
  "current_cad_currency",
  "existing_usd_amount",
  "proposal_source",
])

/** Placeholder amounts that must be rejected */
export const PLACEHOLDER_AMOUNTS = new Set([
  "0",
  "0.00",
  "1",
  "1.00",
  "0.01",
  "99999",
  "99999.00",
  "99999.99",
])

export const MIN_MAJOR_AMOUNT = 0.5
export const MAX_MAJOR_AMOUNT = 500000

function parseLine(line: string): string[] {
  const result: string[] = []
  let entry = ""
  let insideQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (insideQuote && line[i + 1] === '"') {
        entry += '"'
        i++
      } else {
        insideQuote = !insideQuote
      }
    } else if (ch === "," && !insideQuote) {
      result.push(entry.trim())
      entry = ""
    } else {
      entry += ch
    }
  }
  result.push(entry.trim())
  return result
}

function quoteCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Parse the review CSV from a file path, returning typed rows. */
export function parseCsv(filePath: string): ReviewRow[] {
  const text = csvFs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length <= 1) return []
  const headers = parseLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "").trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const cells = parseLine(line)
    return Object.fromEntries(
      CSV_HEADERS.map((header) => {
        const idx = headers.indexOf(header)
        return [header, String(cells[idx] ?? "").trim()]
      })
    ) as ReviewRow
  })
}

/** Simple mutex to serialize concurrent CSV operations */
class SimpleMutex {
  private queue: Array<() => void> = []
  private locked = false

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const release = () => {
        if (this.queue.length > 0) {
          const next = this.queue.shift()
          next?.()
        } else {
          this.locked = false
        }
      }

      if (this.locked) {
        this.queue.push(() => resolve(release))
      } else {
        this.locked = true
        resolve(release)
      }
    })
  }
}

export const csvMutex = new SimpleMutex()

/** Atomically write rows back to CSV using a same-directory temp file + rename/copy. */
export function writeCsv(filePath: string, rows: ReviewRow[]): void {
  const header = CSV_HEADERS.join(",")
  const body = rows
    .map((row) => CSV_HEADERS.map((h) => quoteCsvValue(row[h] ?? "")).join(","))
    .join("\n")
  const content = `${header}\n${body}\n`

  const dir = path.dirname(filePath)
  const base = path.basename(filePath)

  if (!csvFs.existsSync(dir)) {
    csvFs.mkdirSync(dir, { recursive: true })
  }

  // Same-directory unique temp path
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`)

  try {
    csvFs.writeFileSync(tmpPath, content, "utf8")
    
    // Attempt rename
    try {
      csvFs.renameSync(tmpPath, filePath)
    } catch (err) {
      const error = err as NodeJS.ErrnoException
      if (error.code === "EXDEV") {
        // EXDEV fallback
        csvFs.copyFileSync(tmpPath, filePath)
        csvFs.unlinkSync(tmpPath)
      } else {
        throw error
      }
    }
  } catch (error) {
    // Clean up temp file on failure
    if (csvFs.existsSync(tmpPath)) {
      try {
        csvFs.unlinkSync(tmpPath)
      } catch (e) {
        // Ignore unlink error to preserve original error
      }
    }
    throw error
  }
}

/** Validate a major-unit USD amount string. Returns null if invalid. */
export function parseMajorAmount(value: string): number | null {
  const text = String(value || "").trim()
  if (!text) return null
  // Must be: optional leading digit(s), optional .xx
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text)) return null
  const amount = Number(text)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

/**
 * Medusa v2 price amounts in this project are persisted in major units.
 * This deliberately performs no cents conversion.
 */
export function normalizeMedusaPriceAmount(value: string | number): number {
  const amount = typeof value === "number" ? value : parseMajorAmount(value)
  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("price amount must be a positive finite major-unit value")
  }
  return amount
}

/** Build a Medusa v2 price input without converting major units to cents. */
export function buildUsdPriceInput(priceSetId: string, amountMajor: number) {
  if (!priceSetId.trim()) {
    throw new Error("price_set_id is required")
  }
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    throw new Error("amount_major must be a positive finite number")
  }

  return {
    price_set_id: priceSetId,
    currency_code: "usd",
    amount: normalizeMedusaPriceAmount(amountMajor),
    rules: {},
  }
}

/** Comprehensive validation for an approved row's proposed_usd_amount */
export function validateProposedAmount(value: string): string | null {
  const text = String(value || "").trim()
  if (!text) return "proposed_usd_amount is required for APPROVED rows"
  if (/[^\d.]/.test(text)) return "proposed_usd_amount must not contain currency symbols or commas"
  if (/nan|infinity/i.test(text)) return "proposed_usd_amount must not be NaN or Infinity"
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text)) return "proposed_usd_amount must be a valid number with at most 2 decimal places"
  const amount = Number(text)
  if (!Number.isFinite(amount)) return "proposed_usd_amount is not a finite number"
  if (amount <= 0) return "proposed_usd_amount must be greater than zero"
  if (PLACEHOLDER_AMOUNTS.has(text)) return `proposed_usd_amount '${text}' matches a prohibited placeholder value`
  if (amount < MIN_MAJOR_AMOUNT) return `proposed_usd_amount ${amount} is suspiciously low (minimum ${MIN_MAJOR_AMOUNT})`
  if (amount > MAX_MAJOR_AMOUNT) return `proposed_usd_amount ${amount} exceeds maximum allowed (${MAX_MAJOR_AMOUNT})`
  return null
}

/** A meaningful merchant approval is required before an USD price can be used. */
export function validateApprovalNote(value: string): string | null {
  const note = String(value || "").trim()
  if (!note) return "approval note is required for APPROVED rows"
  if (/^merchant usd price required\.?$/i.test(note)) return "merchant confirmation required: replace the generic approval note"
  if (note.length < 12) return "approval note is too short; include meaningful merchant confirmation"
  return null
}
