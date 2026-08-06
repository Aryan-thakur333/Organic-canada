/**
 * GET /admin/usa-price-review
 * Returns the review rows, summary counts, and per-row price eligibility.
 * Requires admin session or bearer token (enforced by middleware).
 *
 * PATCH /admin/usa-price-review
 * Update editable fields (proposed_usd_amount, review_status, notes).
 * Immutable fields (product_id, variant_id, sku, cad amounts, etc.) are rejected.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import {
  REVIEW_CSV,
  parseCsv,
  writeCsv,
  VALID_STATUSES,
  IMMUTABLE_FIELDS,
  validateProposedAmount,
  csvMutex,
} from "./lib/csv-helpers"
import { fingerprintReviewRows } from "./lib/dry-run-proof"
import {
  isRuntimeVerificationFixtureEnabled,
  runtimeFixtureReviewResponse,
  runtimeFixtureWriteBlockedResponse,
} from "./lib/runtime-verification-fixture"

// ─────────────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    if (isRuntimeVerificationFixtureEnabled()) {
      return res.json(runtimeFixtureReviewResponse())
    }

    if (!fs.existsSync(REVIEW_CSV)) {
      return res.status(404).json({ message: "Review CSV not found. Run the prepare-usd-price-review-safely script first." })
    }

    // A row with an existing USD amount is no longer missing a USD price and
    // must leave the active approval queue after import.
    const rows = parseCsv(REVIEW_CSV).filter((row) => !row.existing_usd_amount.trim())

    // Summary counts
    const totalRows = rows.length
    const approvedRows = rows.filter((r) => r.review_status === "APPROVED").length
    const needsReviewRows = rows.filter((r) => r.review_status === "NEEDS_REVIEW").length
    const rejectedRows = rows.filter((r) => r.review_status === "REJECTED").length
    const missingProposedAmount = rows.filter((r) => r.review_status === "APPROVED" && !r.proposed_usd_amount).length
    const invalidStatusRows = rows.filter((r) => r.review_status && !VALID_STATUSES.has(r.review_status)).length

    // Check for duplicate variant IDs
    const variantIdsSeen = new Set<string>()
    const duplicateVariantIds: string[] = []
    for (const row of rows) {
      if (row.variant_id) {
        if (variantIdsSeen.has(row.variant_id)) duplicateVariantIds.push(row.variant_id)
        variantIdsSeen.add(row.variant_id)
      }
    }

    // Enrich each row with a validation_hint field (read-only, computed)
    const enrichedRows = rows.map((row) => {
      const hint: string[] = []
      if (row.review_status === "APPROVED") {
        if (!row.proposed_usd_amount) hint.push("Missing proposed_usd_amount")
        if (!row.notes || row.notes.trim() === "Merchant USD price required") hint.push("Approval note is generic or missing")
      }
      return {
        ...row,
        validation_error: row.review_status === "APPROVED" ? row.validation_error : "",
        validation_hint: hint.join("; "),
      }
    })

    return res.json({
      review_rows: enrichedRows,
      summary: {
        total_rows: totalRows,
        approved_rows: approvedRows,
        needs_review_rows: needsReviewRows,
        rejected_rows: rejectedRows,
        missing_proposed_amount: missingProposedAmount,
        invalid_status_rows: invalidStatusRows,
        duplicate_variant_ids: duplicateVariantIds,
        blocked_for_import: approvedRows === 0 || duplicateVariantIds.length > 0,
        import_ready: approvedRows > 0 && duplicateVariantIds.length === 0 && invalidStatusRows === 0,
        review_fingerprint: fingerprintReviewRows(rows.filter((row) => row.review_status === "APPROVED")),
      },
    })
  } catch (error: any) {
    console.error("[USA_PRICE_REVIEW] GET error:", error)
    return res.status(500).json({ message: error?.message || "Failed to load review rows" })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH
// ─────────────────────────────────────────────────────────────────────────────

interface PatchUpdate {
  variant_id: string
  proposed_usd_amount?: string
  review_status?: string
  notes?: string
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  if (isRuntimeVerificationFixtureEnabled()) {
    return res.status(403).json(runtimeFixtureWriteBlockedResponse("Review-row updates"))
  }

  const release = await csvMutex.acquire()
  try {
    if (!fs.existsSync(REVIEW_CSV)) {
      release()
      return res.status(404).json({ message: "Review CSV not found" })
    }

    const body = req.body as { updates?: PatchUpdate[] }
    if (!body?.updates || !Array.isArray(body.updates) || body.updates.length === 0) {
      release()
      return res.status(400).json({ message: "Body must contain 'updates' array with at least one entry" })
    }

    // Reject any attempts to modify immutable fields
    const forbiddenFields: string[] = []
    for (const update of body.updates) {
      for (const key of Object.keys(update)) {
        if (key !== "variant_id" && IMMUTABLE_FIELDS.has(key as any)) {
          forbiddenFields.push(key)
        }
      }
    }
    if (forbiddenFields.length > 0) {
      release()
      return res.status(400).json({
        message: `The following fields are immutable and cannot be changed: ${[...new Set(forbiddenFields)].join(", ")}`,
        forbidden_fields: [...new Set(forbiddenFields)],
      })
    }

    const rows = parseCsv(REVIEW_CSV)
    const rowsByVariantId = new Map(rows.map((row) => [row.variant_id, row]))
    const results: Array<{ variant_id: string; status: string; errors?: string[] }> = []

    for (const update of body.updates) {
      const variantId = String(update.variant_id || "").trim()
      if (!variantId) {
        results.push({ variant_id: "", status: "ERROR", errors: ["variant_id is required"] })
        continue
      }

      const row = rowsByVariantId.get(variantId)
      if (!row) {
        results.push({ variant_id: variantId, status: "NOT_FOUND", errors: [`No review row found for variant_id: ${variantId}`] })
        continue
      }

      const errors: string[] = []

      // Validate new review_status if provided
      if (update.review_status !== undefined) {
        const newStatus = String(update.review_status || "").trim()
        if (!VALID_STATUSES.has(newStatus)) {
          errors.push(`review_status '${newStatus}' is invalid. Must be one of: NEEDS_REVIEW, APPROVED, REJECTED`)
        }
      }

      // Validate proposed_usd_amount when status is or will be APPROVED
      const effectiveStatus = update.review_status !== undefined ? String(update.review_status || "").trim() : row.review_status
      const effectiveAmount = update.proposed_usd_amount !== undefined ? String(update.proposed_usd_amount || "").trim() : row.proposed_usd_amount

      if (effectiveStatus === "APPROVED") {
        const amountError = validateProposedAmount(effectiveAmount)
        if (amountError) errors.push(amountError)
      }

      if (errors.length > 0) {
        results.push({ variant_id: variantId, status: "VALIDATION_ERROR", errors })
        continue
      }

      // Apply editable updates
      if (update.proposed_usd_amount !== undefined) row.proposed_usd_amount = String(update.proposed_usd_amount || "").trim()
      if (update.review_status !== undefined) row.review_status = String(update.review_status || "").trim()
      if (update.notes !== undefined) row.notes = String(update.notes || "").trim()
      // Clear any previous validation_error when the row is updated
      row.validation_error = ""

      results.push({ variant_id: variantId, status: "UPDATED" })
    }

    // Atomic write
    writeCsv(REVIEW_CSV, rows)

    const updatedCount = results.filter((r) => r.status === "UPDATED").length
    const errorCount = results.filter((r) => r.status !== "UPDATED" && r.status !== "NOT_FOUND").length

    release()
    return res.json({
      updated: updatedCount,
      errors: errorCount,
      not_found: results.filter((r) => r.status === "NOT_FOUND").length,
      results,
    })
  } catch (error: any) {
    release()
    console.error("[USA_PRICE_REVIEW] PATCH error:", error)
    return res.status(500).json({
      type: "csv_persistence_error",
      message: "The price-review row could not be saved.",
      code: "CSV_WRITE_FAILED",
    })
  }
}
