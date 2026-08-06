export type ReviewStatus = "NEEDS_REVIEW" | "APPROVED" | "REJECTED"

export interface ReviewRow {
  product_id: string
  product_handle: string
  product_title: string
  variant_id: string
  variant_title: string
  sku: string
  current_cad_amount: string
  current_cad_currency: string
  existing_usd_amount: string
  proposed_usd_amount: string
  proposal_source: string
  review_status: ReviewStatus
  validation_error: string
  notes: string
  validation_hint: string
}

export type RawReviewRow = Partial<Record<keyof ReviewRow, unknown>>
export type EditableReviewFields = Pick<ReviewRow, "proposed_usd_amount" | "review_status" | "notes">

export function safeString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function safeEditableAmount(value: unknown): string {
  if (typeof value === "string") return value
  return typeof value === "number" && Number.isFinite(value) ? String(value) : ""
}

export function normalizeReviewStatus(value: unknown): ReviewStatus {
  return value === "APPROVED" || value === "REJECTED" ? value : "NEEDS_REVIEW"
}

/** Normalize only fields present on a draft so an empty draft cannot replace
 * a saved APPROVED/REJECTED status with the safe unknown-status default. */
export function normalizePresentEditableFields(value: Record<string, unknown>): Partial<EditableReviewFields> {
  const normalized: Partial<EditableReviewFields> = {}
  if (Object.prototype.hasOwnProperty.call(value, "proposed_usd_amount")) {
    normalized.proposed_usd_amount = safeEditableAmount(value.proposed_usd_amount)
  }
  if (Object.prototype.hasOwnProperty.call(value, "review_status")) {
    normalized.review_status = normalizeReviewStatus(value.review_status)
  }
  if (Object.prototype.hasOwnProperty.call(value, "notes")) {
    normalized.notes = safeString(value.notes)
  }
  return normalized
}

/** Applies only explicitly present editable draft fields and always returns a
 * fully normalized row. Draft data can never replace server identity fields. */
export function mergeReviewDraft(serverRow: RawReviewRow, draftPatch: unknown): ReviewRow {
  const normalizedServer = normalizeReviewRow(serverRow)
  const patch = draftPatch && typeof draftPatch === "object"
    ? normalizePresentEditableFields(draftPatch as Record<string, unknown>)
    : {}
  return normalizeReviewRow({ ...normalizedServer, ...patch })
}

export function isApprovedStatus(value: unknown): boolean {
  return normalizeReviewStatus(value) === "APPROVED"
}

export type RowValidationResult = {
  state: "not-applicable" | "invalid" | "pending" | "valid"
  messages: string[]
}

/** Converts untrusted API, CSV, and restored-draft data into render-safe UI rows. */
export function normalizeReviewRow(raw: RawReviewRow): ReviewRow {
  const variantId = safeString(raw.variant_id)
  const validationError = safeString(raw.validation_error)
  return {
    product_id: safeString(raw.product_id),
    product_handle: safeString(raw.product_handle),
    product_title: safeString(raw.product_title),
    variant_id: variantId,
    variant_title: safeString(raw.variant_title),
    sku: safeString(raw.sku),
    current_cad_amount: safeString(raw.current_cad_amount),
    current_cad_currency: safeString(raw.current_cad_currency),
    existing_usd_amount: safeString(raw.existing_usd_amount),
    proposed_usd_amount: safeEditableAmount(raw.proposed_usd_amount),
    proposal_source: safeString(raw.proposal_source),
    review_status: normalizeReviewStatus(raw.review_status),
    validation_error: variantId ? validationError : validationError || "Row is missing a required variant ID and cannot be saved.",
    notes: safeString(raw.notes),
    validation_hint: safeString(raw.validation_hint),
  }
}

export function localSaveError(row: ReviewRow): string | null {
  if (normalizeReviewStatus(row.review_status) !== "APPROVED") return null
  const amount = safeEditableAmount(row.proposed_usd_amount).trim()
  if (!amount) return "Proposed USD is required."
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount))) return "Proposed USD must be a finite number with at most 2 decimal places."
  if (Number(amount) <= 0) return "Proposed USD must be greater than 0."
  const note = safeString(row.notes).trim()
  if (!note) return "Approval note is required."
  if (/^merchant usd price required\.?$/i.test(note) || note.length < 12) return "Approval note must contain at least 12 meaningful characters."
  return null
}

export function getRowValidation(row: ReviewRow, serverValidationSucceeded: boolean): RowValidationResult {
  if (!row.variant_id) return { state: "invalid", messages: [row.validation_error || "Row is missing a required variant ID."] }
  if (!isApprovedStatus(row.review_status)) return { state: "not-applicable", messages: [] }
  const localError = localSaveError(row)
  if (localError) return { state: "invalid", messages: [localError] }
  if (row.validation_error) return { state: "invalid", messages: [row.validation_error] }
  return serverValidationSucceeded ? { state: "valid", messages: [] } : { state: "pending", messages: [] }
}
