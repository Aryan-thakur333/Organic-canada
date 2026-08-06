import {
  getRowValidation,
  localSaveError,
  mergeReviewDraft,
  normalizePresentEditableFields,
  normalizeReviewRow,
  normalizeReviewStatus,
  safeEditableAmount,
  safeString,
  type ReviewRow,
} from "../../admin/lib/price-review-form"
import {
  getImportDisabledReason,
  getImportWorkflowState,
  getRowWorkflowState,
  type WorkflowSelectorInput,
} from "../../admin/lib/price-review-workflow"

const completeRow = (): ReviewRow => normalizeReviewRow({
  variant_id: "variant_1",
  review_status: "APPROVED",
  proposed_usd_amount: "12.50",
  notes: "Merchant confirmed USD price",
})

describe("USA price-review form-state normalization", () => {
  it("normalizes missing and legacy editable values into controlled strings", () => {
    const row = normalizeReviewRow({ variant_id: "variant_1", proposed_usd_amount: 12.5, notes: null, review_status: undefined, validation_error: undefined })
    expect(row.proposed_usd_amount).toBe("12.5")
    expect(row.notes).toBe("")
    expect(row.review_status).toBe("NEEDS_REVIEW")
    expect(row.validation_error).toBe("")
  })

  it("rejects malformed values and unknown statuses", () => {
    expect(safeString({ text: "unsafe" })).toBe("")
    expect(safeEditableAmount(Number.NaN)).toBe("")
    expect(safeEditableAmount(Infinity)).toBe("")
    expect(normalizeReviewStatus("UNKNOWN")).toBe("NEEDS_REVIEW")
  })

  it("does not overwrite a saved status when an empty draft is merged", () => {
    const serverRow = normalizeReviewRow({ variant_id: "variant_approved", review_status: "APPROVED", proposed_usd_amount: "2", notes: "" })
    const effectiveRow = mergeReviewDraft(serverRow, {})
    expect(effectiveRow.review_status).toBe("APPROVED")
    expect(localSaveError(effectiveRow)).toBe("Approval note is required.")
  })

  it("preserves untouched server fields when a partial draft is merged", () => {
    const serverRow = normalizeReviewRow({ variant_id: "variant_approved", review_status: "APPROVED", proposed_usd_amount: "12.50", notes: "Merchant approved original price" })
    expect(mergeReviewDraft(serverRow, { notes: "Merchant approved revised note" })).toMatchObject({
      review_status: "APPROVED",
      proposed_usd_amount: "12.50",
      notes: "Merchant approved revised note",
    })
    expect(mergeReviewDraft(serverRow, { proposed_usd_amount: "13.25" })).toMatchObject({
      review_status: "APPROVED",
      proposed_usd_amount: "13.25",
      notes: "Merchant approved original price",
    })
  })

  it("prevents malformed draft data from replacing server identity", () => {
    const serverRow = normalizeReviewRow({ product_id: "prod_1", variant_id: "variant_1", sku: "SKU-1", review_status: "APPROVED" })
    expect(mergeReviewDraft(serverRow, { product_id: "prod_evil", variant_id: "variant_evil", sku: "EVIL", notes: { unsafe: true } })).toMatchObject({
      product_id: "prod_1",
      variant_id: "variant_1",
      sku: "SKU-1",
      review_status: "APPROVED",
      notes: "",
    })
  })

  it("normalizes only draft fields that are actually present", () => {
    expect(normalizePresentEditableFields({ notes: undefined })).toEqual({ notes: "" })
    expect(normalizePresentEditableFields({ proposed_usd_amount: "3.25" })).toEqual({ proposed_usd_amount: "3.25" })
    expect(normalizePresentEditableFields({})).toEqual({})
  })

  it("never throws for missing approved-row fields", () => {
    const row = normalizeReviewRow({ variant_id: "variant_1", review_status: "APPROVED" })
    expect(() => localSaveError(row)).not.toThrow()
    expect(localSaveError(row)).toBe("Proposed USD is required.")
  })

  it("preserves approval validation for missing notes and invalid amounts", () => {
    const missingNote = completeRow()
    missingNote.notes = ""
    expect(localSaveError(missingNote)).toBe("Approval note is required.")
    const invalidAmount = completeRow()
    invalidAmount.proposed_usd_amount = "not-a-number"
    expect(localSaveError(invalidAmount)).toBe("Proposed USD must be a finite number with at most 2 decimal places.")
  })

  it.each(["NEEDS_REVIEW", "REJECTED"] as const)("does not apply approval rules to %s rows", (review_status) => {
    const row = normalizeReviewRow({ variant_id: "variant_1", review_status, validation_error: "stale approval error" })
    expect(localSaveError(row)).toBeNull()
    expect(getRowValidation(row, false)).toEqual({ state: "not-applicable", messages: [] })
  })

  it("distinguishes invalid, pending, and server-validated APPROVED rows", () => {
    expect(getRowValidation(normalizeReviewRow({ variant_id: "variant_1", review_status: "APPROVED" }), false).state).toBe("invalid")
    expect(getRowValidation(completeRow(), false)).toEqual({ state: "pending", messages: [] })
    expect(getRowValidation(completeRow(), true)).toEqual({ state: "valid", messages: [] })
  })
})

describe("USA price import workflow selectors", () => {
  const readyInput = (): WorkflowSelectorInput => ({
    approvedCount: 2,
    dirtyCount: 0,
    currentFingerprint: "current",
    validation: { validForImport: true, fingerprint: "current", validatedAt: "2026-07-27T10:00:00.000Z" },
    dryRun: {
      status: "PASS",
      dryRunId: "dry_current",
      fingerprint: "current",
      createdAt: "2026-07-27T10:01:00.000Z",
      pricesToCreate: 2,
      failedValidation: 0,
    },
    isValidating: false,
    isDryRunning: false,
    isImporting: false,
    importCompleted: false,
    storefrontVerified: false,
    sessionExpired: false,
    backendUnavailable: false,
    serverFailure: false,
  })

  it("reaches ready-for-import only for matching validation and dry-run fingerprints", () => {
    expect(getImportWorkflowState(readyInput())).toBe("ready-for-import")
    expect(getImportDisabledReason(readyInput())).toBeNull()
  })

  it("blocks stale validation after a saved-row fingerprint changes", () => {
    const input = readyInput()
    input.currentFingerprint = "changed"
    expect(getImportWorkflowState(input)).toBe("invalid")
    expect(getImportDisabledReason(input)).toBe("Validate the current saved approved rows.")
  })

  it("blocks a stale or failed dry run", () => {
    const stale = readyInput()
    if (stale.dryRun) stale.dryRun.fingerprint = "old"
    expect(getImportDisabledReason(stale)).toBe("Run a successful Dry Run for the current validation.")
    const failed = readyInput()
    if (failed.dryRun) failed.dryRun.failedValidation = 1
    expect(getImportDisabledReason(failed)).toBe("Run a successful Dry Run for the current validation.")
  })

  it("blocks dirty rows, session expiry, backend loss, and duplicate in-flight import", () => {
    const dirty = readyInput(); dirty.dirtyCount = 1
    expect(getImportWorkflowState(dirty)).toBe("dirty")
    const expired = readyInput(); expired.sessionExpired = true
    expect(getImportDisabledReason(expired)).toBe("Sign in again before importing.")
    const offline = readyInput(); offline.backendUnavailable = true
    expect(getImportDisabledReason(offline)).toBe("Reconnect to the backend before importing.")
    const importing = readyInput(); importing.isImporting = true
    expect(getImportDisabledReason(importing)).toBe("An import request is already in progress.")
  })

  it("keeps row editing state independent from review status", () => {
    expect(getRowWorkflowState(completeRow(), true, true)).toBe("dirty")
    expect(getRowWorkflowState(completeRow(), false, false)).toBe("saved")
    expect(getRowWorkflowState(completeRow(), false, true)).toBe("valid")
    const invalid = completeRow(); invalid.validation_error = "Existing USD conflict"
    expect(getRowWorkflowState(invalid, false, true)).toBe("invalid")
  })
})
