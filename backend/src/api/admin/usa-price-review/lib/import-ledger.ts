import { createHash } from "crypto"
import * as fs from "fs"
import * as path from "path"
import { REPORTS_DIR } from "./csv-helpers"

export const IMPORT_LEDGER_JSON = path.resolve(REPORTS_DIR, "usa-price-import-idempotency.json")
export const IMPORT_AUDIT_JSON = path.resolve(REPORTS_DIR, "usa-price-import-audit.json")

export type ImportRowResult = {
  product_id: string
  product_title: string
  variant_id: string
  sku: string
  requested_usd: number
  imported_usd: number | null
  result: "IMPORTED" | "ALREADY_CORRECT" | "FAILED"
  message: string
}

export type ImportResult = {
  status: "APPLIED" | "PARTIAL" | "FAILED"
  import_id: string
  idempotency_key: string
  dry_run_id: string
  validation_fingerprint: string
  timestamp: string
  requested: number
  imported: number
  already_correct: number
  skipped: number
  failed: number
  price_sets_created: number
  cad_prices_modified: 0
  existing_usd_overwritten: 0
  duplicate_usd_created: 0
  cad_prices_preserved: number
  business_data_writes: number
  row_results: ImportRowResult[]
  idempotent_replay?: boolean
}

type LedgerEntry = {
  dry_run_id: string
  validation_fingerprint: string
  result: ImportResult
}

type ImportLedger = Record<string, LedgerEntry>

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T
  } catch {
    return fallback
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`,
  )
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    try {
      fs.renameSync(tempPath, filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error
      fs.copyFileSync(tempPath, filePath)
      fs.unlinkSync(tempPath)
    }
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath) } catch { /* preserve the original error */ }
    }
    throw error
  }
}

export function expectedIdempotencyKey(dryRunId: string): string {
  return `usa-price-import-${dryRunId}`
}

export function createImportId(idempotencyKey: string): string {
  return `upi_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 20)}`
}

export function getImportResult(idempotencyKey: string): LedgerEntry | null {
  return readJson<ImportLedger>(IMPORT_LEDGER_JSON, {})[idempotencyKey] ?? null
}

export function storeImportResult(result: ImportResult): void {
  const ledger = readJson<ImportLedger>(IMPORT_LEDGER_JSON, {})
  ledger[result.idempotency_key] = {
    dry_run_id: result.dry_run_id,
    validation_fingerprint: result.validation_fingerprint,
    result: { ...result, idempotent_replay: undefined },
  }
  writeJsonAtomic(IMPORT_LEDGER_JSON, ledger)

  const audit = readJson<ImportResult[]>(IMPORT_AUDIT_JSON, [])
  audit.push({ ...result, idempotent_replay: undefined })
  writeJsonAtomic(IMPORT_AUDIT_JSON, audit)
}

export function isMatchingLedgerEntry(
  entry: LedgerEntry,
  dryRunId: string,
  fingerprint: string,
): boolean {
  return entry.dry_run_id === dryRunId && entry.validation_fingerprint === fingerprint
}
