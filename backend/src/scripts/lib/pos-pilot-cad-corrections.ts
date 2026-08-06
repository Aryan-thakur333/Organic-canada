import * as fs from "fs"
import { readApprovedCsv } from "./approved-pos-csv"

export const POS_PILOT_CAD_TARGETS = new Map([
  ["variant_01KVSFB7CD3CVS9WN4SCVE9YXT", { productId: "prod_01KVSFB7BAX6R5GFXKKCC4CYHX", title: "Fresh Bananas" }],
  ["variant_01KVSFB7M7DJ2NQP1MRFC161ZP", { productId: "prod_01KVSFB7KH3MAADTC8FXDNB7K9", title: "Organic Carrots" }],
  ["variant_01KVSFB83K91ZD462YSQSFPK8C", { productId: "prod_01KVSFB82HYD8N48WG7XQGKWBW", title: "Organic Milk" }],
  ["variant_01KVSFB8FGBH5QYY47W48PZY7B", { productId: "prod_01KVSFB8ENFV01KZE8AYE46CJB", title: "Whole Wheat Bread" }],
] as const)

export const POS_PILOT_CAD_REVIEW_HEADERS = [
  "product_id", "product_title", "variant_id", "variant_title", "price_id", "price_set_id",
  "currency_code", "current_cad_price", "current_usd_price", "calculated_cad_price",
  "suspicious_reason", "expected_input_unit", "medusa_storage_unit",
  "approved_corrected_cad_price", "approval_status", "approved_by", "approval_reference",
  "reviewed_at", "notes", "pos_channel_linked", "barcode", "inventory_item_id",
  "register_id", "region_id", "stock_location_id", "stocked_quantity", "reserved_quantity",
  "available_quantity", "audit_timestamp",
] as const

export type PilotCadReviewRow = Record<typeof POS_PILOT_CAD_REVIEW_HEADERS[number], string>

export type CurrentPilotCadVariant = {
  productId: string
  productTitle: string
  variantId: string
  priceId: string
  priceSetId: string
  cadAmount: unknown
}

export type PilotCadAction = {
  rowNumber: number
  productId: string
  productTitle: string
  variantId: string
  priceId: string
  priceSetId: string
  oldCadAmount: number
  approvedInputMajor: string
  canonicalMinorUnits: number
  medusaMajorAmount: number
}

export type PilotCadValidation = {
  actions: PilotCadAction[]
  issues: Array<{ rowNumber: number; variantId: string; reason: string }>
  summary: {
    rowsRead: number
    approvedRows: number
    pendingRows: number
    rejectedRows: number
    plannedCreates: number
    plannedUpdates: number
    unchangedRows: number
    invalidRows: number
    staleRows: number
    missingProducts: number
    missingVariants: number
    duplicateApprovals: number
    currencyMismatches: number
    unitErrors: number
    databaseWrites: number
    passed: boolean
  }
}

const decimalPattern = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/

export type MerchantApprovalAudit = {
  rows: Array<{ productTitle: string; variantId: string; approvedPriceMajor: number | null; approvalStatus: string; approvedBy: string; approvalReference: string; validationStatus: "VALID" | "INVALID" | "PENDING" | "REJECTED"; validationErrors: string[] }>
  summary: { rowsRead: number; approvedRows: number; pendingRows: number; rejectedRows: number; invalidApprovalRows: number; missingApprovalReferences: number; missingApproverNames: number; duplicateReferences: number; readyForDryRun: boolean }
}

/** Merchant input is major-unit CAD. The integer form is used only for exact validation. */
export function parseApprovedCadMajor(value: unknown, unsafeMajorCeiling = 1000) {
  const text = String(value ?? "").trim()
  const match = decimalPattern.exec(text)
  if (!match) return { valid: false as const, reason: "must be a plain CAD major-unit value with at most two decimals" }
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount <= 0) return { valid: false as const, reason: "must be finite and greater than zero" }
  if (amount > unsafeMajorCeiling) return { valid: false as const, reason: `exceeds the CAD ${unsafeMajorCeiling} safety ceiling` }
  const minorUnits = Math.round(amount * 100)
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) return { valid: false as const, reason: "cannot be represented safely at two-decimal precision" }
  return { valid: true as const, inputMajor: text, minorUnits, medusaMajorAmount: minorUnits / 100 }
}

export function auditMerchantApprovals(rows: Array<{ rowNumber: number; values: PilotCadReviewRow }>, unsafeMajorCeiling = 1000): MerchantApprovalAudit {
  const result: MerchantApprovalAudit["rows"] = []
  const summary = { rowsRead: rows.length, approvedRows: 0, pendingRows: 0, rejectedRows: 0, invalidApprovalRows: 0, missingApprovalReferences: 0, missingApproverNames: 0, duplicateReferences: 0, readyForDryRun: false }
  const seenReferences = new Set<string>()
  for (const { values: row } of rows) {
    // Approval status is deliberately case-sensitive. This prevents a spreadsheet
    // normalization or casual lowercase value from silently becoming authorization.
    const status = String(row.approval_status || "").trim()
    const errors: string[] = []
    let validationStatus: MerchantApprovalAudit["rows"][number]["validationStatus"] = "PENDING"
    let parsed: ReturnType<typeof parseApprovedCadMajor> | null = null
    if (status === "APPROVED") {
      summary.approvedRows++
      parsed = parseApprovedCadMajor(row.approved_corrected_cad_price, unsafeMajorCeiling)
      if (!parsed.valid) errors.push(`approved_corrected_cad_price ${parsed.reason}`)
      if (!String(row.approved_by || "").trim()) { errors.push("approved_by is required"); summary.missingApproverNames++ }
      const reference = String(row.approval_reference || "").trim()
      if (!reference) { errors.push("approval_reference is required"); summary.missingApprovalReferences++ }
      else if (seenReferences.has(reference)) { errors.push("approval_reference must be unique"); summary.duplicateReferences++ }
      else seenReferences.add(reference)
      validationStatus = errors.length ? "INVALID" : "VALID"
    } else if (status === "PENDING") {
      summary.pendingRows++; validationStatus = "PENDING"
    } else if (status === "REJECTED") {
      summary.rejectedRows++; validationStatus = "REJECTED"
    } else {
      errors.push("approval_status must be APPROVED, PENDING, or REJECTED"); validationStatus = "INVALID"
    }
    if (validationStatus === "INVALID") summary.invalidApprovalRows++
    result.push({ productTitle: row.product_title, variantId: row.variant_id, approvedPriceMajor: parsed?.valid ? parsed.medusaMajorAmount : null, approvalStatus: status, approvedBy: row.approved_by, approvalReference: row.approval_reference, validationStatus, validationErrors: errors })
  }
  summary.readyForDryRun = summary.approvedRows > 0 && summary.invalidApprovalRows === 0 && summary.duplicateReferences === 0
  return { rows: result, summary }
}

function equalAmount(left: unknown, right: unknown) {
  const a = Number(left), b = Number(right)
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.0000001
}

export function validatePilotCadCorrections(
  rows: Array<{ rowNumber: number; values: PilotCadReviewRow }>,
  currentVariants: ReadonlyMap<string, CurrentPilotCadVariant>,
  unsafeMajorCeiling = 1000
): PilotCadValidation {
  const actions: PilotCadAction[] = []
  const issues: PilotCadValidation["issues"] = []
  const seenApproved = new Set<string>()
  const seenReferences = new Set<string>()
  const summary = { rowsRead: rows.length, approvedRows: 0, pendingRows: 0, rejectedRows: 0, plannedCreates: 0, plannedUpdates: 0, unchangedRows: 0, invalidRows: 0, staleRows: 0, missingProducts: 0, missingVariants: 0, duplicateApprovals: 0, currencyMismatches: 0, unitErrors: 0, databaseWrites: 0, passed: false }
  const issue = (rowNumber: number, variantId: string, reason: string, kind: "invalid" | "stale" | "missing-product" | "missing-variant" | "currency" | "unit" = "invalid") => {
    issues.push({ rowNumber, variantId, reason })
    if (kind === "stale") summary.staleRows++
    else if (kind === "missing-product") summary.missingProducts++
    else if (kind === "missing-variant") summary.missingVariants++
    else if (kind === "currency") summary.currencyMismatches++
    else if (kind === "unit") summary.unitErrors++
    else summary.invalidRows++
  }

  for (const { rowNumber, values: row } of rows) {
    const variantId = String(row.variant_id || "").trim()
    const status = String(row.approval_status || "").trim()
    if (status === "PENDING") { summary.pendingRows++; continue }
    if (status === "REJECTED") { summary.rejectedRows++; continue }
    if (status !== "APPROVED") { issue(rowNumber, variantId, "approval_status must exactly equal APPROVED, PENDING, or REJECTED"); continue }
    summary.approvedRows++
    if (seenApproved.has(variantId)) { summary.duplicateApprovals++; issue(rowNumber, variantId, "duplicate approved variant_id"); continue }
    seenApproved.add(variantId)
    const expected = POS_PILOT_CAD_TARGETS.get(variantId as any)
    const current = currentVariants.get(variantId)
    if (!expected || expected.productId !== row.product_id) {
      issue(rowNumber, variantId, "unknown pilot product or product/variant relationship changed", "missing-product"); continue
    }
    if (!current || current.productId !== row.product_id || current.productTitle !== row.product_title) { issue(rowNumber, variantId, "variant is missing or no longer matches the audited product", "missing-variant"); continue }
    if (String(row.currency_code || "").trim().toLowerCase() !== "cad") { issue(rowNumber, variantId, "currency_code must be present and equal cad", "currency"); continue }
    const parsed = parseApprovedCadMajor(row.approved_corrected_cad_price, unsafeMajorCeiling)
    if (!parsed.valid) { issue(rowNumber, variantId, `approved_corrected_cad_price ${parsed.reason}`, "unit"); continue }
    if (!String(row.approved_by || "").trim()) { issue(rowNumber, variantId, "approved_by is required"); continue }
    const approvalReference = String(row.approval_reference || "").trim()
    if (!approvalReference) { issue(rowNumber, variantId, "approval_reference is required"); continue }
    if (seenReferences.has(approvalReference)) { summary.duplicateApprovals++; issue(rowNumber, variantId, "approval_reference must be unique"); continue }
    seenReferences.add(approvalReference)
    if (!current.priceId || !current.priceSetId || current.priceId !== row.price_id || current.priceSetId !== row.price_set_id) {
      issue(rowNumber, variantId, "CAD price or price-set identity changed", "stale"); continue
    }
    if (equalAmount(current.cadAmount, parsed.medusaMajorAmount)) { summary.unchangedRows++; continue }
    if (!equalAmount(current.cadAmount, row.current_cad_price)) { issue(rowNumber, variantId, `stale CAD snapshot: review '${row.current_cad_price}', current '${current.cadAmount}'`, "stale"); continue }
    actions.push({ rowNumber, productId: current.productId, productTitle: current.productTitle, variantId, priceId: current.priceId, priceSetId: current.priceSetId, oldCadAmount: Number(current.cadAmount), approvedInputMajor: parsed.inputMajor, canonicalMinorUnits: parsed.minorUnits, medusaMajorAmount: parsed.medusaMajorAmount })
  }
  summary.plannedUpdates = actions.length
  summary.passed = summary.approvedRows > 0 && summary.invalidRows === 0 && summary.staleRows === 0 && summary.missingProducts === 0 && summary.missingVariants === 0 && summary.duplicateApprovals === 0 && summary.currencyMismatches === 0 && summary.unitErrors === 0 && summary.plannedCreates + summary.plannedUpdates + summary.unchangedRows === summary.approvedRows
  return { actions, issues, summary }
}

export function readPilotCadReview(filePath: string) {
  return readApprovedCsv(filePath, POS_PILOT_CAD_REVIEW_HEADERS) as Array<{ rowNumber: number; values: PilotCadReviewRow }>
}

function spreadsheetSafe(value: unknown) { const text = String(value ?? ""); return /^[=+@-]/.test(text) ? `'${text}` : text }
function csvCell(value: unknown) { return `"${spreadsheetSafe(value).replace(/"/g, '""')}"` }

export function writePilotCadReview(filePath: string, rows: PilotCadReviewRow[]) {
  const content = [POS_PILOT_CAD_REVIEW_HEADERS.join(","), ...rows.map((row) => POS_PILOT_CAD_REVIEW_HEADERS.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n"
  fs.writeFileSync(filePath, content, "utf8")
}
