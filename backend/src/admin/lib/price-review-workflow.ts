import type { ReviewRow } from "./price-review-form"

export type ImportWorkflowState =
  | "idle"
  | "dirty"
  | "saved"
  | "validating"
  | "valid"
  | "invalid"
  | "dry-running"
  | "dry-run-passed"
  | "ready-for-import"
  | "importing"
  | "imported"
  | "storefront-verified"
  | "failed"

export type ValidationSnapshot = {
  validForImport: boolean
  fingerprint: string
  validatedAt: string
}

export type DryRunSnapshot = {
  status: string
  dryRunId: string
  fingerprint: string
  createdAt: string
  pricesToCreate: number
  failedValidation: number
}

export type WorkflowSelectorInput = {
  approvedCount: number
  dirtyCount: number
  currentFingerprint: string
  validation: ValidationSnapshot | null
  dryRun: DryRunSnapshot | null
  isValidating: boolean
  isDryRunning: boolean
  isImporting: boolean
  importCompleted: boolean
  storefrontVerified: boolean
  sessionExpired: boolean
  backendUnavailable: boolean
  serverFailure: boolean
}

export function getRowWorkflowState(
  row: ReviewRow,
  isDirty: boolean,
  validatedFingerprintMatches: boolean,
): ImportWorkflowState {
  if (isDirty) return "dirty"
  if (row.review_status !== "APPROVED") return "idle"
  if (row.validation_error) return "invalid"
  return validatedFingerprintMatches ? "valid" : "saved"
}

export function hasCurrentValidation(input: WorkflowSelectorInput): boolean {
  return Boolean(
    input.validation?.validForImport &&
    input.currentFingerprint &&
    input.validation.fingerprint === input.currentFingerprint,
  )
}

export function hasCurrentDryRun(input: WorkflowSelectorInput): boolean {
  return Boolean(
    hasCurrentValidation(input) &&
    input.dryRun?.status === "PASS" &&
    input.dryRun.dryRunId &&
    input.dryRun.fingerprint === input.currentFingerprint &&
    input.dryRun.failedValidation === 0,
  )
}

export function getImportWorkflowState(input: WorkflowSelectorInput): ImportWorkflowState {
  if (input.sessionExpired || input.backendUnavailable || input.serverFailure) return "failed"
  if (input.storefrontVerified) return "storefront-verified"
  if (input.importCompleted) return "imported"
  if (input.isImporting) return "importing"
  if (input.dirtyCount > 0) return "dirty"
  if (input.isValidating) return "validating"
  if (input.validation && !hasCurrentValidation(input)) return "invalid"
  if (input.isDryRunning) return "dry-running"
  if (hasCurrentDryRun(input)) {
    return (input.dryRun?.pricesToCreate ?? 0) > 0 ? "ready-for-import" : "dry-run-passed"
  }
  if (hasCurrentValidation(input)) return "valid"
  if (input.approvedCount > 0) return "saved"
  return "idle"
}

export function getImportDisabledReason(input: WorkflowSelectorInput): string | null {
  if (input.sessionExpired) return "Sign in again before importing."
  if (input.backendUnavailable) return "Reconnect to the backend before importing."
  if (input.serverFailure) return "Resolve the server error before importing."
  if (input.isImporting) return "An import request is already in progress."
  if (input.dirtyCount > 0) return "Save all pricing drafts before validating or importing."
  if (input.approvedCount === 0) return "Approve and save at least one row."
  if (!hasCurrentValidation(input)) return "Validate the current saved approved rows."
  if (!hasCurrentDryRun(input)) return "Run a successful Dry Run for the current validation."
  if ((input.dryRun?.pricesToCreate ?? 0) <= 0) return "Dry Run found no eligible USD prices to create."
  return null
}
