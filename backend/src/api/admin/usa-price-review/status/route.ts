/**
 * GET /admin/usa-price-review/status
 * Returns a quick summary of the current import workflow state
 * without loading all row data. Useful for dashboard polling.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"
import { REPORTS_DIR, REVIEW_CSV, parseCsv } from "../lib/csv-helpers"

const IMPORT_RESULT_JSON = path.resolve(REPORTS_DIR, "final-approved-usd-price-live-import.json")
const DRY_RUN_JSON = path.resolve(REPORTS_DIR, "final-approved-usd-price-dry-run.json")

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    if (!fs.existsSync(REVIEW_CSV)) {
      return res.json({
        csv_present: false,
        workflow_status: "CSV_NOT_FOUND",
        approved_rows: 0,
        needs_review_rows: 0,
        rejected_rows: 0,
        total_rows: 0,
        last_import_result: null,
        last_dry_run: null,
      })
    }

    const rows = parseCsv(REVIEW_CSV).filter((row) => !row.existing_usd_amount.trim())
    const approvedRows = rows.filter((r) => r.review_status === "APPROVED").length
    const needsReviewRows = rows.filter((r) => r.review_status === "NEEDS_REVIEW").length
    const rejectedRows = rows.filter((r) => r.review_status === "REJECTED").length
    const readyToImport = approvedRows > 0

    let lastImportResult: Record<string, unknown> | null = null
    if (fs.existsSync(IMPORT_RESULT_JSON)) {
      try { lastImportResult = JSON.parse(fs.readFileSync(IMPORT_RESULT_JSON, "utf8")) } catch { /* ignore */ }
    }

    let lastDryRun: Record<string, unknown> | null = null
    if (fs.existsSync(DRY_RUN_JSON)) {
      try { lastDryRun = JSON.parse(fs.readFileSync(DRY_RUN_JSON, "utf8")) } catch { /* ignore */ }
    }

    const workflowStatus = approvedRows === 0
      ? "BLOCKED_NO_APPROVED_ROWS"
      : lastImportResult?.status === "APPLIED"
      ? "IMPORT_COMPLETE"
      : "READY_FOR_IMPORT"

    return res.json({
      csv_present: true,
      workflow_status: workflowStatus,
      approved_rows: approvedRows,
      needs_review_rows: needsReviewRows,
      rejected_rows: rejectedRows,
      total_rows: rows.length,
      ready_to_import: readyToImport,
      last_import_result: lastImportResult
        ? {
            status: lastImportResult.status,
            live_prices_created: lastImportResult.live_prices_created,
            created_at: lastImportResult.created_at,
          }
        : null,
      last_dry_run: lastDryRun
        ? {
            status: lastDryRun.status,
            prices_to_create: lastDryRun.prices_to_create,
          }
        : null,
    })
  } catch (error: any) {
    console.error("[USA_PRICE_REVIEW] status error:", error)
    return res.status(500).json({ message: error?.message || "Failed to get status" })
  }
}
