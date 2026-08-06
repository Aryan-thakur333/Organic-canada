import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  CurrencyDollar,
  CheckCircle,
  XCircle,
  ExclamationCircle,
  ArrowPath,
  Spinner,
  MagnifyingGlass,
  Funnel,
  CheckCircleSolid,
  XCircleSolid,
} from "@medusajs/icons"
import {
  Container,
  Heading,
  Text,
  Button,
  Badge,
  Table,
  toast,
  Input,
  Select,
  Checkbox,
  Tooltip,
  FocusModal,
  Label,
} from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { EATSIE_ADMIN_BUILD_ID } from "../../generated/eatsie-build"
import { ADMIN_SESSION_EXPIRED_EVENT, AdminApiError, adminApiRequest, cancelActiveProtectedRequests, installProtectedAdminFetchGuard, isAdminSessionExpired, resetAdminSessionExpired, shouldRetryAdminQuery } from "../../lib/admin-api"
import { rememberAdminReturnPath, USA_PRICE_APPROVAL_RETURN_PATH } from "../../lib/admin-session"
import { getRowValidation, localSaveError, mergeReviewDraft, normalizePresentEditableFields, normalizeReviewRow, normalizeReviewStatus, safeEditableAmount, safeString, type RawReviewRow, type ReviewRow, type ReviewStatus } from "../../lib/price-review-form"
import { getImportDisabledReason, getImportWorkflowState, getRowWorkflowState, hasCurrentValidation, type DryRunSnapshot, type ValidationSnapshot, type WorkflowSelectorInput } from "../../lib/price-review-workflow"

installProtectedAdminFetchGuard()

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ReviewSummary {
  total_rows: number
  approved_rows: number
  needs_review_rows: number
  rejected_rows: number
  missing_proposed_amount: number
  invalid_status_rows: number
  duplicate_variant_ids: string[]
  blocked_for_import: boolean
  import_ready: boolean
  review_fingerprint: string
}

interface ReviewResponse {
  review_rows: unknown[]
  summary: ReviewSummary
  runtime_fixture?: boolean
}

interface DryRunResult {
  status: string
  database_writes: number
  prices_to_create: number
  price_sets_to_create: number
  already_correct: number
  skipped_not_approved: number
  failed_validation: number
  cad_prices_preserved: number
  existing_usd_prices_preserved: number
  planned_creates: unknown[]
  row_results?: Array<{ variant_id: string; action: string; reason?: string }>
  preview_fingerprint?: string
  validation_fingerprint?: string
  dry_run_id?: string | null
  created_at?: string
  expires_at?: string | null
}

interface PatchResult {
  variant_id: string
  status: string
  errors?: string[]
}
interface PatchResponse { updated: number; results: PatchResult[] }
interface ValidationResponse {
  validated: number
  valid_rows: number
  invalid_rows: number
  valid_for_import: boolean
  validation_fingerprint: string
  validated_at: string
}

interface ImportRowResult {
  product_id: string
  product_title: string
  variant_id: string
  sku: string
  requested_usd: number
  imported_usd: number | null
  result: "IMPORTED" | "ALREADY_CORRECT" | "FAILED"
  message: string
}

interface ImportResult {
  status: "APPLIED" | "PARTIAL" | "FAILED"
  import_id: string
  idempotency_key: string
  dry_run_id: string
  timestamp: string
  requested: number
  imported: number
  already_correct: number
  skipped: number
  failed: number
  cad_prices_modified: number
  existing_usd_overwritten: number
  duplicate_usd_created: number
  row_results: ImportRowResult[]
  idempotent_replay?: boolean
}

interface StoreVerificationResult {
  status: "PASS" | "FAIL"
  verified: number
  failed: number
  region_id: string
  country_code: string
  currency_code: string
  store_statuses: number[]
  row_results: Array<{
    product_id: string
    variant_id: string
    requested_usd: number
    storefront_usd: number | null
    currency_code: string | null
    verified: boolean
    message: string
  }>
}

type FilterType = "ALL" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED" | "MISSING_PRICE_SET" | "MISSING_USD"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatCad(amount: string): string {
  if (!amount) return "—"
  const num = Number(amount)
  if (!Number.isFinite(num)) return amount
  return `CA$${(num / 100).toFixed(2)}`
}

function formatUsd(amount: string): string {
  if (!amount) return "—"
  const num = Number(amount)
  if (!Number.isFinite(num)) return amount
  // Stored as major units already
  return `$${num.toFixed(2)}`
}

type ConnectionErrorType = "BACKEND_DOWN" | "SESSION_EXPIRED" | "SERVER_ERROR" | "VALIDATION_ERROR" | "ROUTE_NOT_FOUND" | "CONFLICT" | null
const DRAFT_STORAGE_KEY = "eatsie_usa_price_review_draft_v1"
type DraftEntry = { proposed_usd_amount?: string; review_status?: ReviewStatus; notes?: string; baseFingerprint: string; draftedAt: string }
type StoredDrafts = { version: 1; updatedAt: string; edits: Record<string, DraftEntry> }
type BuildIdentityState =
  | "loading"
  | "ready"
  | "outdated"
  | "metadata-unavailable"
  | "backend-unavailable"
  | "session-expired"
  | "persistent-mismatch"


function isNetworkErrorObject(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    error.name === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("connection") ||
    msg.includes("refused")
  )
}

/**
 * Reload the Admin using the stable http://localhost:9000/app path.
 * Never uses ephemeral Vite HMR ports.
 */
function reloadAdminPage(): void {
  // Always navigate through port 9000 — never a Vite ephemeral port
  const stableUrl = `${window.location.protocol}//localhost:9000/app/usa-price-approval`
  window.location.href = stableUrl
}

/**
 * Classify the type of error:
 *   BACKEND_DOWN   — network/connection refused (health unreachable)
 *   SESSION_EXPIRED — HTTP 401 from a protected endpoint
 *   SERVER_ERROR   — HTTP 5xx from the backend
 */
function errorState(error: unknown): ConnectionErrorType {
  // Transport failures are wrapped by adminApiRequest. Any other error is a
  // local implementation/response-contract fault, never a lost backend.
  if (!(error instanceof AdminApiError)) return "SERVER_ERROR"
  if (error.category === "session-expired") return "SESSION_EXPIRED"
  if (error.category === "backend-unavailable") return "BACKEND_DOWN"
  if (error.category === "server-error") return "SERVER_ERROR"
  if (error.category === "validation-error") return "VALIDATION_ERROR"
  if (error.category === "route-not-found") return "ROUTE_NOT_FOUND"
  return "CONFLICT"
}

function isReviewResponse(value: unknown): value is ReviewResponse {
  if (!value || typeof value !== "object") return false
  const response = value as { review_rows?: unknown; summary?: unknown }
  if (!Array.isArray(response.review_rows) || !response.summary || typeof response.summary !== "object") return false
  const summary = response.summary as { total_rows?: unknown; approved_rows?: unknown; needs_review_rows?: unknown; rejected_rows?: unknown }
  return [summary.total_rows, summary.approved_rows, summary.needs_review_rows, summary.rejected_rows]
    .every((count) => typeof count === "number")
}

function normalizeDraftEntry(value: unknown): DraftEntry | null {
  if (!value || typeof value !== "object") return null
  const draft = value as Record<string, unknown>
  const baseFingerprint = safeString(draft.baseFingerprint)
  const draftedAt = safeString(draft.draftedAt)
  if (!baseFingerprint || !draftedAt) return null
  return {
    baseFingerprint,
    draftedAt,
    ...normalizePresentEditableFields(draft),
  }
}

function readDrafts(): Record<string, DraftEntry> {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "null") as unknown
    if (!saved || typeof saved !== "object") return {}
    const parsed = saved as { version?: unknown; edits?: unknown }
    if (parsed.version !== 1 || !parsed.edits || typeof parsed.edits !== "object") return {}
    const restored: Record<string, DraftEntry> = {}
    for (const [variantId, draft] of Object.entries(parsed.edits)) {
      const normalizedDraft = normalizeDraftEntry(draft)
      if (variantId.length > 0 && normalizedDraft) restored[variantId] = normalizedDraft
    }
    return restored
  } catch { return {} }
}

function editableFingerprint(row: Pick<ReviewRow, "proposed_usd_amount" | "review_status" | "notes">): string {
  return JSON.stringify([safeEditableAmount(row.proposed_usd_amount), normalizeReviewStatus(row.review_status), safeString(row.notes)])
}

function editableFields(draft: Partial<DraftEntry>): Partial<Pick<DraftEntry, "proposed_usd_amount" | "review_status" | "notes">> {
  return normalizePresentEditableFields(draft)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}


// ─────────────────────────────────────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────────────────────────────────────

const UsaPriceApprovalPage = () => {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [isDryRunning, setIsDryRunning] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterType>("ALL")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set())
  const [isSessionExpired, setIsSessionExpired] = useState(false)
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [connectionErrorType, setConnectionErrorType] = useState<ConnectionErrorType>(null)
  const [buildIdentityState, setBuildIdentityState] = useState<BuildIdentityState>("loading")
  const [serverBuildId, setServerBuildId] = useState<string | null>(null)
  const [draftConflicts, setDraftConflicts] = useState<Set<string>>(new Set())
  const [isRuntimeFixture, setIsRuntimeFixture] = useState(false)
  const [validationSnapshot, setValidationSnapshot] = useState<ValidationSnapshot | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importConfirmation, setImportConfirmation] = useState("")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [storeVerification, setStoreVerification] = useState<StoreVerificationResult | null>(null)
  const [verificationLoading, setVerificationLoading] = useState(false)
  const healthCheckRunning = useRef(false)
  const importRequestRunning = useRef(false)

  // Pending local edits keyed by variant_id
  const [pendingEdits, setPendingEdits] = useState<Record<string, DraftEntry>>(readDrafts)
  const pendingEditsRef = useRef(pendingEdits)
  const workflowPendingEdits: Record<string, DraftEntry> = isRuntimeFixture ? {} : pendingEdits

  const enterSessionExpiredState = useCallback(() => {
    cancelActiveProtectedRequests()
    void queryClient.cancelQueries()
    rememberAdminReturnPath(USA_PRICE_APPROVAL_RETURN_PATH)
    setIsSessionExpired(true)
    setIsNetworkError(false)
    setConnectionErrorType("SESSION_EXPIRED")
    setValidationSnapshot(null)
    setDryRunResult(null)
    setImportModalOpen(false)
    setImportConfirmation("")
  }, [queryClient])

  useEffect(() => {
    const defaults = queryClient.getDefaultOptions()
    queryClient.setDefaultOptions({
      ...defaults,
      queries: {
        ...defaults.queries,
        retry: shouldRetryAdminQuery,
        refetchOnWindowFocus: () => !isAdminSessionExpired(),
        refetchOnReconnect: () => !isAdminSessionExpired(),
      },
    })
  }, [queryClient])

  useEffect(() => {
    const handleSessionExpired = () => enterSessionExpiredState()
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired)
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired)
  }, [enterSessionExpiredState])

  useEffect(() => {
    pendingEditsRef.current = pendingEdits
    try {
      if (Object.keys(pendingEdits).length) {
        const draft: StoredDrafts = { version: 1, updatedAt: new Date().toISOString(), edits: pendingEdits }
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
      } else {
        localStorage.removeItem(DRAFT_STORAGE_KEY)
      }
    } catch { /* Private browsing/storage quotas must not break editing. */ }
  }, [pendingEdits])

  // ── Build Identity & Stale Cache Check ──────────────────────────────────────
  useEffect(() => {
    try {
      const deprecated = ["eatsie_stale_bundle", "eatsie_admin_build", "eatsie_reload_count"]
      deprecated.forEach((key) => {
        sessionStorage.removeItem(key)
        localStorage.removeItem(key)
      })
    } catch (e) {}

    const checkBuildIdentity = async () => {
      try {
        // This generated module is the only browser bundle identity source.
        // Storage and query parameters are only used to prevent reload loops.
        const bundleBuildId = EATSIE_ADMIN_BUILD_ID
        const res = await fetch("/app/eatsie-build.json?t=" + Date.now(), {
          cache: "no-store",
          credentials: "same-origin",
        })
        if (!res.ok) {
          setBuildIdentityState(res.status === 401 ? "session-expired" : res.status >= 500 ? "backend-unavailable" : "metadata-unavailable")
          return
        }

        const data = await res.json()
        const currentServerBuildId = typeof data.buildId === "string" && data.buildId.trim()
          ? data.buildId
          : null
        setServerBuildId(currentServerBuildId)

        const hasMismatch = Boolean(bundleBuildId) && Boolean(currentServerBuildId) && bundleBuildId !== currentServerBuildId
        if (!hasMismatch) {
          if (!currentServerBuildId) {
            setBuildIdentityState("metadata-unavailable")
            return
          }

          setBuildIdentityState("ready")
          sessionStorage.removeItem("eatsie_reload_attempted")
          const urlObj = new URL(window.location.href)
          if (urlObj.searchParams.has("admin_build")) {
            urlObj.searchParams.delete("admin_build")
            window.history.replaceState({}, "", urlObj.pathname + urlObj.search)
          }
          return
        }

        const alreadyAttempted = sessionStorage.getItem("eatsie_reload_attempted")
        setBuildIdentityState(alreadyAttempted === currentServerBuildId ? "persistent-mismatch" : "outdated")
      } catch (error) {
        setBuildIdentityState(isNetworkErrorObject(error) ? "backend-unavailable" : "metadata-unavailable")
      }
    }

    checkBuildIdentity()
  }, [])

  // ── Data Loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async (force = false) => {
    if (isSessionExpired && !force) return
    setIsLoading(true)
    setIsNetworkError(false)
    setConnectionErrorType(null)
    if (force) {
      resetAdminSessionExpired()
      setIsSessionExpired(false)
    }
    let sessionExpiredThisLoad = false
    try {
      const data = await adminApiRequest<unknown>("/admin/usa-price-review")
      if (!isReviewResponse(data)) {
        throw new Error("Price-review API returned an unexpected response shape")
      }
      const fixtureMode = data.runtime_fixture === true
      const normalizedRows = data.review_rows.map((row) => normalizeReviewRow(
        row && typeof row === "object" ? row as RawReviewRow : {}
      ))
      const conflicts = new Set<string>()
      for (const row of normalizedRows) {
        const draft = fixtureMode ? undefined : pendingEditsRef.current[row.variant_id]
        if (draft && draft.baseFingerprint !== editableFingerprint(row)) conflicts.add(row.variant_id)
      }
      setIsRuntimeFixture(fixtureMode)
      setDraftConflicts(conflicts)
      if (conflicts.size) toast.warning("Some server rows changed while drafts were pending", { description: "Your local edits were preserved. Review conflicted rows before saving." })
      setRows(normalizedRows)
      const activeVariantIds = new Set(normalizedRows.map((row) => row.variant_id))
      setSelectedVariantIds((previous) => new Set([...previous].filter((variantId) => activeVariantIds.has(variantId))))
      setSummary(data.summary || null)
      setIsSessionExpired(false)
      setConnectionErrorType(null)
      const nextFingerprint = data.summary.review_fingerprint || ""
      setValidationSnapshot((previous) =>
        previous?.fingerprint === nextFingerprint ? previous : null
      )
      setDryRunResult((previous) =>
        previous?.validation_fingerprint === nextFingerprint ? previous : null
      )
    } catch (error: unknown) {
      const state = errorState(error)
      if (state === "SESSION_EXPIRED") {
        sessionExpiredThisLoad = true
        enterSessionExpiredState()
      } else if (state === "BACKEND_DOWN") {
        setIsNetworkError(true)
        setConnectionErrorType("BACKEND_DOWN")
        setSummary(null)
        setDryRunResult(null)
        setValidationSnapshot(null)
      } else if (!sessionExpiredThisLoad) {
        setConnectionErrorType(state)
        toast.error("Failed to load price review data", { description: errorMessage(error, "Unknown error") })
      }
    } finally {
      setIsLoading(false)
    }
  }, [enterSessionExpiredState, isSessionExpired])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!isNetworkError) return
    const timer = window.setInterval(async () => {
      if (healthCheckRunning.current) return
      healthCheckRunning.current = true
      try {
        await adminApiRequest("/health", { maxGetAttempts: 1 })
        await loadData()
      } catch { /* Keep polling only while the backend is unavailable. */ }
      finally { healthCheckRunning.current = false }
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [isNetworkError, loadData])

  // A session-expired state is terminal until the user completes a new login.
  // It deliberately stops polling/refetching so protected endpoints cannot
  // enter a 401 loop while the expired cookie is still present.
  useEffect(() => {
    if (!isSessionExpired) return
    healthCheckRunning.current = false
    setIsNetworkError(false)
  }, [isSessionExpired])

  const recoverSessionAndLoadData = useCallback(async () => {
    resetAdminSessionExpired()
    setIsLoading(true)
    try {
      await adminApiRequest("/admin/users/me", { maxGetAttempts: 1 })
      await loadData(true)
    } catch (error: unknown) {
      const state = errorState(error)
      if (state === "SESSION_EXPIRED") {
        enterSessionExpiredState()
      } else if (state === "BACKEND_DOWN") {
        setIsSessionExpired(false)
        setIsNetworkError(true)
        setConnectionErrorType("BACKEND_DOWN")
      } else {
        setConnectionErrorType(state)
      }
    } finally {
      setIsLoading(false)
    }
  }, [enterSessionExpiredState, loadData])

  // ── Filtered / Searched Rows ────────────────────────────────────────────────

  const displayedRows = useMemo(() => {
    let filtered = rows

    // Apply status filter
    if (filterStatus === "NEEDS_REVIEW") filtered = filtered.filter((r) => r.review_status === "NEEDS_REVIEW")
    else if (filterStatus === "APPROVED") filtered = filtered.filter((r) => r.review_status === "APPROVED")
    else if (filterStatus === "REJECTED") filtered = filtered.filter((r) => r.review_status === "REJECTED")
    else if (filterStatus === "MISSING_USD") filtered = filtered.filter((r) => !r.existing_usd_amount && !r.proposed_usd_amount)

    // Apply search
    if (safeString(searchQuery).trim()) {
      const q = safeString(searchQuery).toLowerCase().trim()
      filtered = filtered.filter(
        (r) =>
          safeString(r.product_title).toLowerCase().includes(q) ||
          safeString(r.product_handle).toLowerCase().includes(q) ||
          safeString(r.sku).toLowerCase().includes(q) ||
          safeString(r.variant_title).toLowerCase().includes(q)
      )
    }

    return filtered
  }, [rows, filterStatus, searchQuery])

  // ── Local Editing ───────────────────────────────────────────────────────────

  function updatePendingEdit(variantId: string, field: keyof DraftEntry, value: string) {
    if (isRuntimeFixture) return
    const serverRow = rows.find((row) => row.variant_id === variantId)
    if (!serverRow || field === "baseFingerprint" || field === "draftedAt") return
    setPendingEdits((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] || { baseFingerprint: editableFingerprint(serverRow), draftedAt: new Date().toISOString() }),
        [field]: value,
      },
    }))
    setValidationSnapshot(null)
    setDryRunResult(null)
  }

  function getEffectiveRow(row: ReviewRow): ReviewRow {
    const edits = workflowPendingEdits[row.variant_id] || {}
    return mergeReviewDraft(row, edits)
  }

  // ── Save (PATCH) ────────────────────────────────────────────────────────────

  async function saveRow(variantId: string) {
    if (isSessionExpired || isRuntimeFixture) return
    const edits = pendingEdits[variantId]
    if (!edits || Object.keys(edits).length === 0) return
    const serverRow = rows.find((row) => row.variant_id === variantId)
    if (!serverRow) return
    const localError = localSaveError(getEffectiveRow(serverRow))
    if (localError) {
      toast.error("Cannot save row", { description: localError })
      return
    }
    if (draftConflicts.has(variantId)) {
      toast.error("Server row changed", { description: "Reset or review this draft against the refreshed server row before saving." })
      return
    }

    setIsSaving(true)
    try {
      const data = await adminApiRequest<PatchResponse>("/admin/usa-price-review", {
        method: "PATCH",
        body: JSON.stringify({
          updates: [{ variant_id: variantId, ...editableFields(edits) }],
        }),
      })

      const rowResult = data.results?.find((result) => result.variant_id === variantId)
      if (rowResult?.status === "VALIDATION_ERROR") {
        toast.error("Validation error", { description: rowResult.errors?.join("; ") })
        return
      }

      // Commit local state
      setRows((prev) =>
        prev.map((r) => (r.variant_id === variantId ? mergeReviewDraft(r, edits) : r))
      )
      setPendingEdits((prev) => {
        const next = { ...prev }
        delete next[variantId]
        return next
      })
      setDraftConflicts((previous) => {
        const next = new Set(previous)
        next.delete(variantId)
        return next
      })
      
      // Invalidate previous dry-run result and reload fresh counts/validation states from server
      setDryRunResult(null)
      setValidationSnapshot(null)
      await loadData()
      
      toast.success("Row saved")
    } catch (error: unknown) {
      const state = errorState(error)
      if (state === "SESSION_EXPIRED") {
        enterSessionExpiredState()
      } else if (state === "BACKEND_DOWN") {
        setIsNetworkError(true)
        setConnectionErrorType(state)
        setSummary(null)
        setDryRunResult(null)
      } else {
        toast.error("Save failed", { description: errorMessage(error, "The review file could not be updated. Please retry.") })
      }
    } finally {
      setIsSaving(false)
    }
  }

  function resetRow(variantId: string) {
    if (isRuntimeFixture) return
    setPendingEdits((prev) => {
      const next = { ...prev }
      delete next[variantId]
      return next
    })
    setValidationSnapshot(null)
    setDryRunResult(null)
  }

  // ── Bulk Actions ────────────────────────────────────────────────────────────

  async function bulkSetStatus(status: ReviewStatus) {
    if (isSessionExpired || isRuntimeFixture) return
    if (selectedVariantIds.size === 0) {
      toast.warning("No rows selected")
      return
    }

    // For bulk APPROVED, require a proposed amount to already be set
    if (status === "APPROVED") {
      const missingAmount = [...selectedVariantIds].some((vid) => {
        const row = rows.find((r) => r.variant_id === vid)
        const edits = pendingEdits[vid] || {}
        const amount = edits.proposed_usd_amount !== undefined ? edits.proposed_usd_amount : row?.proposed_usd_amount
        return !safeEditableAmount(amount).trim()
      })
      if (missingAmount) {
        toast.error("Cannot bulk-approve", {
          description: "Some selected rows do not have a proposed USD amount. Enter amounts individually first.",
        })
        return
      }
    }

    const updates = [...selectedVariantIds].map((vid) => ({
      variant_id: vid,
      review_status: status,
      ...(pendingEdits[vid] ? editableFields(pendingEdits[vid]) : {}),
    }))

    setIsSaving(true)
    setValidationSnapshot(null)
    setDryRunResult(null)
    try {
      const data = await adminApiRequest<PatchResponse>("/admin/usa-price-review", {
        method: "PATCH",
        body: JSON.stringify({ updates }),
      })

      await loadData()
      setPendingEdits((previous) => Object.fromEntries(Object.entries(previous).filter(([variantId]) => !selectedVariantIds.has(variantId))))
      setSelectedVariantIds(new Set())
      toast.success(`${data.updated} row(s) updated to ${status}`)
    } catch (error: unknown) {
      const state = errorState(error)
      if (state === "SESSION_EXPIRED") {
        enterSessionExpiredState()
      } else if (state === "BACKEND_DOWN") {
        setIsNetworkError(true)
        setConnectionErrorType(state)
        setSummary(null)
        setDryRunResult(null)
      } else {
        toast.error("Bulk update failed", { description: errorMessage(error, "Bulk update failed") })
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function bulkValidate() {
    if (isSessionExpired) return
    if (Object.keys(workflowPendingEdits).length > 0) {
      toast.warning("Save pricing drafts first", { description: "Validation only runs against saved rows." })
      return
    }
    setIsValidating(true)
    setValidationSnapshot(null)
    setDryRunResult(null)
    try {
      const data = await adminApiRequest<ValidationResponse>("/admin/usa-price-review/validate", {
        method: "POST",
        body: JSON.stringify({}),
      })
      await loadData()
      setValidationSnapshot({
        validForImport: data.valid_for_import,
        fingerprint: data.validation_fingerprint,
        validatedAt: data.validated_at,
      })
      toast.success(`Validated ${data.validated} row(s): ${data.valid_rows} valid, ${data.invalid_rows} invalid`)
    } catch (error: unknown) {
      const state = errorState(error)
      if (state === "SESSION_EXPIRED") {
        enterSessionExpiredState()
      } else if (state === "BACKEND_DOWN") {
        setIsNetworkError(true)
        setConnectionErrorType(state)
        setSummary(null)
        setDryRunResult(null)
      } else {
        toast.error("Validation failed", { description: errorMessage(error, "Validation failed") })
      }
    } finally {
      setIsValidating(false)
    }
  }

  async function runDryRun() {
    if (isSessionExpired) return
    if (Object.keys(workflowPendingEdits).length > 0) {
      toast.warning("Save pricing drafts first", { description: "Dry Run only uses saved rows." })
      return
    }
    if (!validationSnapshot?.validForImport || validationSnapshot.fingerprint !== summary?.review_fingerprint) {
      toast.warning("Validate the current saved rows first")
      return
    }
    setIsDryRunning(true)
    setDryRunResult(null)
    try {
      const data = await adminApiRequest<DryRunResult>("/admin/usa-price-review/dry-run", {
        method: "POST",
        body: JSON.stringify({}),
      })
      setDryRunResult(data)
      toast.success("Dry run complete — no writes performed")
    } catch (error: unknown) {
      const state = errorState(error)
      if (state === "SESSION_EXPIRED") {
        enterSessionExpiredState()
      } else if (state === "BACKEND_DOWN") {
        setIsNetworkError(true)
        setConnectionErrorType(state)
        setSummary(null)
        setDryRunResult(null)
      } else {
        toast.error("Dry run failed", { description: errorMessage(error, "Dry run failed") })
      }
    } finally {
      setIsDryRunning(false)
    }
  }

  async function verifyStorefront(idempotencyKey: string) {
    setVerificationLoading(true)
    setStoreVerification(null)
    try {
      const verification = await adminApiRequest<StoreVerificationResult>("/admin/usa-price-review/verify", {
        method: "POST",
        body: JSON.stringify({ idempotency_key: idempotencyKey }),
      })
      setStoreVerification(verification)
      if (verification.status === "PASS") toast.success("Storefront verification passed")
      else toast.warning("Storefront verification found mismatches")
    } catch (error: unknown) {
      const state = errorState(error)
      if (state === "SESSION_EXPIRED") enterSessionExpiredState()
      else toast.error("Storefront verification failed", { description: errorMessage(error, "Read-only Store API verification failed") })
    } finally {
      setVerificationLoading(false)
    }
  }

  async function resolveUnknownImport(idempotencyKey: string): Promise<ImportResult | null> {
    try {
      return await adminApiRequest<ImportResult>(
        `/admin/usa-price-review/import-status?idempotency_key=${encodeURIComponent(idempotencyKey)}`,
        { maxGetAttempts: 2 },
      )
    } catch {
      return null
    }
  }

  async function executeLiveImport() {
    if (isRuntimeFixture) return
    if (importRequestRunning.current || isImporting || importConfirmation !== "IMPORT_APPROVED_USD_PRICES") return
    if (!dryRunResult?.dry_run_id || !dryRunResult.validation_fingerprint) return
    const idempotencyKey = `usa-price-import-${dryRunResult.dry_run_id}`
    importRequestRunning.current = true
    setIsImporting(true)
    setStoreVerification(null)
    try {
      const result = await adminApiRequest<ImportResult>("/admin/usa-price-review/import", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          confirm: "IMPORT_APPROVED_USD_PRICES",
          dry_run_id: dryRunResult.dry_run_id,
          validation_fingerprint: dryRunResult.validation_fingerprint,
          currency_code: "usd",
        }),
      })
      setImportResult(result)
      setImportModalOpen(false)
      setImportConfirmation("")
      setValidationSnapshot(null)
      setDryRunResult(null)
      await loadData()
      await verifyStorefront(result.idempotency_key)
      toast.success(`Import ${result.status.toLowerCase()}: ${result.imported} USD price(s) created`)
    } catch (error: unknown) {
      const state = errorState(error)
      if (state === "SESSION_EXPIRED") {
        enterSessionExpiredState()
      } else if (state === "BACKEND_DOWN" || state === "SERVER_ERROR") {
        const recovered = await resolveUnknownImport(idempotencyKey)
        if (recovered) {
          setImportResult(recovered)
          setImportModalOpen(false)
          setImportConfirmation("")
          await loadData()
          await verifyStorefront(recovered.idempotency_key)
        } else if (state === "BACKEND_DOWN") {
          setIsNetworkError(true)
          setConnectionErrorType("BACKEND_DOWN")
          toast.error("Import outcome is unknown", { description: "The POST was not retried. Reconnect and check this import status before taking another action." })
        } else {
          toast.error("Import status unavailable", { description: "The POST was not retried. Review the import audit/status before starting another import." })
        }
      } else {
        toast.error("Import blocked or failed", { description: errorMessage(error, "The guarded import was not completed.") })
      }
    } finally {
      importRequestRunning.current = false
      setIsImporting(false)
    }
  }

  const allSelected = displayedRows.length > 0 && displayedRows.every((r) => selectedVariantIds.has(r.variant_id))
  const someSelected = displayedRows.some((r) => selectedVariantIds.has(r.variant_id)) && !allSelected
  const approvedCount = rows.filter((row) => row.review_status === "APPROVED").length
  const hasBlockingValidation = rows.some((row) => row.review_status === "APPROVED" && Boolean(row.validation_error))
  const currentFingerprint = summary?.review_fingerprint ?? ""
  const dryRunSnapshot: DryRunSnapshot | null = dryRunResult?.dry_run_id
    ? {
        status: dryRunResult.status,
        dryRunId: dryRunResult.dry_run_id,
        fingerprint: dryRunResult.validation_fingerprint ?? "",
        createdAt: dryRunResult.created_at ?? "",
        pricesToCreate: dryRunResult.prices_to_create,
        failedValidation: dryRunResult.failed_validation,
      }
    : null
  const workflowInput: WorkflowSelectorInput = {
    approvedCount,
    dirtyCount: Object.keys(workflowPendingEdits).length,
    currentFingerprint,
    validation: validationSnapshot,
    dryRun: dryRunSnapshot,
    isValidating,
    isDryRunning,
    isImporting,
    importCompleted: Boolean(importResult),
    storefrontVerified: storeVerification?.status === "PASS",
    sessionExpired: isSessionExpired,
    backendUnavailable: isNetworkError,
    serverFailure: connectionErrorType === "SERVER_ERROR",
  }
  const workflowState = getImportWorkflowState(workflowInput)
  const importDisabledReason = getImportDisabledReason(workflowInput)
  const validationReady = hasCurrentValidation(workflowInput)
  const apiActionsDisabled = isNetworkError || isSessionExpired || connectionErrorType === "SERVER_ERROR" || isImporting

  function toggleSelectRow(variantId: string) {
    setSelectedVariantIds((prev) => {
      const next = new Set(prev)
      if (next.has(variantId)) next.delete(variantId)
      else next.add(variantId)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedVariantIds((prev) => {
        const next = new Set(prev)
        displayedRows.forEach((r) => next.delete(r.variant_id))
        return next
      })
    } else {
      setSelectedVariantIds((prev) => {
        const next = new Set(prev)
        displayedRows.forEach((r) => next.add(r.variant_id))
        return next
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (buildIdentityState === "persistent-mismatch") {
    return (
      <Container className="p-12 flex flex-col items-center justify-center gap-y-4 max-w-lg mx-auto mt-10">
        <ExclamationCircle className="text-red-500 w-12 h-12" />
        <Heading level="h1" className="text-xl font-semibold text-red-600">Bundle Mismatch Persists</Heading>
        <Text className="text-ui-fg-subtle text-center">
          The latest Admin bundle could not be loaded. Clear site data and reopen the Admin.
        </Text>
        <div className="rounded border border-red-200 bg-red-50 p-4 text-xs font-mono text-red-900 w-full mt-2 space-y-1">
          <div><strong>Bundle Build ID:</strong> {EATSIE_ADMIN_BUILD_ID || "none"}</div>
          <div><strong>Server Build ID:</strong> {serverBuildId || "none"}</div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 w-full mt-2">
          <strong>Manual Recovery Steps:</strong>
          <ol className="list-decimal list-inside mt-2 space-y-1">
            <li>Close all old Admin browser tabs.</li>
            <li>Open Chrome DevTools (Press <code>F12</code>).</li>
            <li>Go to <strong>Application</strong> &rarr; <strong>Storage</strong>.</li>
            <li>Click <strong>Clear site data</strong>.</li>
            <li>Reopen the Admin in a fresh tab at: <code>http://localhost:9000/app</code></li>
          </ol>
        </div>
      </Container>
    )
  }

  if (buildIdentityState === "outdated") {
    return (
      <Container className="p-12 flex flex-col items-center justify-center gap-y-4 max-w-lg mx-auto mt-10">
        <ExclamationCircle className="text-amber-500 w-12 h-12" />
        <Heading level="h1" className="text-xl font-semibold">Outdated Bundle Loaded</Heading>
        <Text className="text-ui-fg-subtle text-center">
          An outdated Admin bundle is loaded. Reload the Admin to use the latest stable build.
        </Text>
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-xs font-mono text-amber-900 w-full mt-2 space-y-1">
          <div><strong>Bundle Build ID:</strong> {EATSIE_ADMIN_BUILD_ID || "none"}</div>
          <div><strong>Server Build ID:</strong> {serverBuildId || "none"}</div>
        </div>
        <Button onClick={() => {
          if (serverBuildId) {
            try {
              sessionStorage.setItem("eatsie_reload_attempted", serverBuildId)
            } catch (e) {}
            const bustUrl = `${window.location.origin}/app/usa-price-approval?admin_build=${serverBuildId}`
            window.location.replace(bustUrl)
          } else {
            window.location.reload()
          }
        }}>
          Reload Stable Admin
        </Button>
      </Container>
    )
  }

  if (isSessionExpired) {
    return (
      <Container className="p-12 flex flex-col items-center justify-center gap-y-4 max-w-lg mx-auto mt-10">
        <XCircleSolid className="text-red-500 w-12 h-12" />
        <Heading level="h1" className="text-xl font-semibold">Session Expired</Heading>
        <Text className="text-ui-fg-subtle text-center">
          Your Admin session has expired. Please sign in again.
            Your pricing drafts are preserved locally. Sign in again to return
            here; no save, validation, dry run, or import will run automatically.
        </Text>
        <div className="flex gap-x-2">
          <Button onClick={() => {
            rememberAdminReturnPath(USA_PRICE_APPROVAL_RETURN_PATH)
            window.location.href = "/app/login"
          }}>
            Go to Login
          </Button>
          <Button variant="secondary" onClick={() => void recoverSessionAndLoadData()} disabled={isLoading}>
            Retry (I just logged in)
          </Button>
        </div>
      </Container>
    )
  }

  return (
    <Container className="p-6 flex flex-col gap-y-5">
      {(isNetworkError || connectionErrorType === "SERVER_ERROR" || connectionErrorType === "ROUTE_NOT_FOUND" || connectionErrorType === "CONFLICT") && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-start justify-between gap-x-4">
          <div className="flex items-start space-x-2">
            <XCircleSolid className="text-red-500 w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <Text className="text-red-800 font-semibold">
                {connectionErrorType === "SERVER_ERROR"
                  ? "Backend server error. Check server logs."
                  : connectionErrorType === "ROUTE_NOT_FOUND"
                    ? "Price-review API route was not found. Check the deployed Admin/backend build."
                    : connectionErrorType === "CONFLICT"
                      ? "Price-review data changed on the server. Refresh before saving your drafts."
                  : "Backend connection lost. Restart the server, then reload the Admin."}
              </Text>
              <Text className="text-red-700 text-sm mt-1">
                {connectionErrorType === "SERVER_ERROR"
                  ? "The backend returned a 5xx error. No price data was modified. Retry after checking logs."
                  : connectionErrorType === "ROUTE_NOT_FOUND" || connectionErrorType === "CONFLICT"
                    ? "No price data was modified. Your unsaved edits remain available locally."
                  : "All Save, Validate, Dry Run, and Import actions are disabled until the connection is restored. Unsaved edits are preserved."}
              </Text>
            </div>
          </div>
          <div className="flex items-center gap-x-2 flex-shrink-0">
            <Button variant="secondary" size="small" onClick={() => void loadData()}>
              Retry API
            </Button>
            <Button variant="secondary" size="small" onClick={reloadAdminPage}>
              Reload Admin
            </Button>
          </div>
        </div>
      )}
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-x-4 flex-wrap gap-y-2">
        <div>
          <Heading level="h1" className="text-2xl font-semibold flex items-center gap-x-2">
            <CurrencyDollar className="text-ui-fg-muted" />
            USA Price Approval
          </Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Review and approve USD prices for the USA storefront. Only APPROVED rows with valid amounts will be imported.
          </Text>
        </div>
        <div className="flex items-center gap-x-2 flex-wrap gap-y-2">
          <Button
            variant="secondary"
            size="small"
            onClick={() => void loadData()}
            disabled={isLoading}
          >
            {isLoading ? <Spinner className="animate-spin" /> : <ArrowPath />}
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary Badges ──────────────────────────────────────────────────── */}
      {summary && (
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          <Badge color="grey">Total: {summary.total_rows}</Badge>
          <Badge color="orange">Needs Review: {summary.needs_review_rows}</Badge>
          <Badge color="green">Approved: {summary.approved_rows}</Badge>
          <Badge color="red">Rejected: {summary.rejected_rows}</Badge>
          {summary.blocked_for_import && (
            <Badge color="red">
              <ExclamationCircle className="w-3 h-3 mr-1" />
              BLOCKED — no approved rows
            </Badge>
          )}
          <Badge color={workflowState === "ready-for-import" || workflowState === "storefront-verified" ? "green" : workflowState === "failed" ? "red" : "blue"}>
            Workflow: {workflowState}
          </Badge>
          {workflowState === "ready-for-import" && (
            <Badge color="green">
              <CheckCircle className="w-3 h-3 mr-1" />
              Ready for import
            </Badge>
          )}
          {isRuntimeFixture && (
            <Badge color="orange" data-testid="runtime-verification-fixture-badge">
              Runtime fixture - isolated, read-only, and blocked from Import
            </Badge>
          )}
        </div>
      )}

      {/* ── Dry Run Result ──────────────────────────────────────────────────── */}
      {dryRunResult && (
        <div className="border border-ui-border-base rounded-lg p-4 bg-ui-bg-subtle">
          <Text className="font-semibold mb-2">
            Dry Run Result:{" "}
            <span className={dryRunResult.status === "PASS" ? "text-green-600" : "text-amber-600"}>
              {dryRunResult.status}
            </span>
          </Text>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div><span className="text-ui-fg-subtle">Prices to create:</span> <strong>{dryRunResult.prices_to_create}</strong></div>
            <div><span className="text-ui-fg-subtle">Price sets to create:</span> <strong>{dryRunResult.price_sets_to_create}</strong></div>
            <div><span className="text-ui-fg-subtle">Already correct:</span> <strong>{dryRunResult.already_correct}</strong></div>
            <div><span className="text-ui-fg-subtle">Failed validation:</span> <strong className={dryRunResult.failed_validation > 0 ? "text-red-600" : ""}>{dryRunResult.failed_validation}</strong></div>
            <div><span className="text-ui-fg-subtle">CAD prices preserved:</span> <strong>{dryRunResult.cad_prices_preserved}</strong></div>
            <div><span className="text-ui-fg-subtle">USD prices preserved:</span> <strong>{dryRunResult.existing_usd_prices_preserved}</strong></div>
            <div><span className="text-ui-fg-subtle">DB writes:</span> <strong className="text-green-600">{dryRunResult.database_writes} (none)</strong></div>
          </div>
          {dryRunResult.dry_run_id && (
            <Text className="mt-2 text-xs text-ui-fg-muted">
              Proof {dryRunResult.dry_run_id} created {dryRunResult.created_at ? new Date(dryRunResult.created_at).toLocaleString() : "now"}
            </Text>
          )}
          {dryRunResult.row_results?.some((result) => result.reason) && (
            <div className="mt-3 space-y-1">
              <Text className="font-medium text-sm">Row-level results</Text>
              {dryRunResult.row_results.filter((result) => result.reason).map((result, index) => (
                <Text key={`${result.variant_id}-${index}`} className="text-xs text-red-700">
                  {result.variant_id}: {result.reason}
                </Text>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Filters & Search ────────────────────────────────────────────────── */}
      {importResult && (
        <div className="border border-ui-border-base rounded-lg p-4 bg-ui-bg-subtle" data-testid="usa-price-import-result">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Text className="font-semibold">Live Import Result: {importResult.status}</Text>
              <Text className="text-xs text-ui-fg-muted">Import {importResult.import_id} at {new Date(importResult.timestamp).toLocaleString()}</Text>
            </div>
            <Badge color={importResult.failed > 0 ? "orange" : "green"}>
              {importResult.imported} imported / {importResult.failed} failed
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-sm">
            <div>Requested: <strong>{importResult.requested}</strong></div>
            <div>Imported: <strong>{importResult.imported}</strong></div>
            <div>Already correct: <strong>{importResult.already_correct}</strong></div>
            <div>Skipped: <strong>{importResult.skipped}</strong></div>
            <div>CAD modified: <strong>{importResult.cad_prices_modified}</strong></div>
            <div>Existing USD overwritten: <strong>{importResult.existing_usd_overwritten}</strong></div>
            <div>Duplicate USD created: <strong>{importResult.duplicate_usd_created}</strong></div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <Table.Header><Table.Row><Table.HeaderCell>Product / Variant</Table.HeaderCell><Table.HeaderCell>Requested USD</Table.HeaderCell><Table.HeaderCell>Imported USD</Table.HeaderCell><Table.HeaderCell>Result</Table.HeaderCell><Table.HeaderCell>Message</Table.HeaderCell></Table.Row></Table.Header>
              <Table.Body>
                {importResult.row_results.map((result) => (
                  <Table.Row key={result.variant_id}>
                    <Table.Cell><Text className="text-sm">{result.product_title}</Text><Text className="text-xs text-ui-fg-muted">{result.sku || result.variant_id}</Text></Table.Cell>
                    <Table.Cell>{formatUsd(String(result.requested_usd))}</Table.Cell>
                    <Table.Cell>{result.imported_usd === null ? "-" : formatUsd(String(result.imported_usd))}</Table.Cell>
                    <Table.Cell><Badge color={result.result === "FAILED" ? "red" : "green"}>{result.result}</Badge></Table.Cell>
                    <Table.Cell><Text className="text-xs">{result.message}</Text></Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </div>
      )}

      {(verificationLoading || storeVerification) && (
        <div className="border border-ui-border-base rounded-lg p-4">
          <Text className="font-semibold">Store API Verification: {verificationLoading ? "checking..." : storeVerification?.status}</Text>
          {storeVerification && (
            <Text className="text-sm text-ui-fg-subtle">
              {storeVerification.verified} verified, {storeVerification.failed} failed in dynamic USD/US region {storeVerification.region_id}. HTTP statuses: {storeVerification.store_statuses.join(", ")}.
            </Text>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted w-4 h-4" />
          <Input
            className="pl-9"
            placeholder="Search product title, handle, SKU…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-x-2">
          <Funnel className="text-ui-fg-muted" />
          {(["ALL", "NEEDS_REVIEW", "APPROVED", "REJECTED", "MISSING_USD"] as FilterType[]).map((f) => (
            <Button
              key={f}
              variant={filterStatus === f ? "primary" : "secondary"}
              size="small"
              onClick={() => setFilterStatus(f)}
            >
              {f.replace("_", " ")}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Bulk Actions ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <Text className="text-ui-fg-subtle text-sm">
          {selectedVariantIds.size} selected
        </Text>
        <Button size="small" variant="secondary" onClick={() => bulkSetStatus("APPROVED")} disabled={isRuntimeFixture || selectedVariantIds.size === 0 || isSaving || apiActionsDisabled}>
          <CheckCircleSolid className="text-green-600" /> Approve Selected
        </Button>
        <Button size="small" variant="secondary" onClick={() => bulkSetStatus("NEEDS_REVIEW")} disabled={isRuntimeFixture || selectedVariantIds.size === 0 || isSaving || apiActionsDisabled}>
          <ExclamationCircle className="text-amber-600" /> Mark Needs Review
        </Button>
        <Button size="small" variant="secondary" onClick={() => bulkSetStatus("REJECTED")} disabled={isRuntimeFixture || selectedVariantIds.size === 0 || isSaving || apiActionsDisabled}>
          <XCircleSolid className="text-red-600" /> Reject Selected
        </Button>
        <Button size="small" variant="secondary" onClick={() => setSelectedVariantIds(new Set())} disabled={isRuntimeFixture || selectedVariantIds.size === 0 || apiActionsDisabled}>
          Clear Selection
        </Button>
        <Button size="small" variant="secondary" onClick={bulkValidate} disabled={isValidating || apiActionsDisabled || approvedCount === 0 || Object.keys(workflowPendingEdits).length > 0}>
          {isValidating ? <Spinner className="animate-spin" /> : <CheckCircle />}
          Validate All Approved
        </Button>
        <Button size="small" variant="secondary" onClick={runDryRun} disabled={isDryRunning || apiActionsDisabled || approvedCount === 0 || !validationReady || hasBlockingValidation || Object.keys(workflowPendingEdits).length > 0}>
          {isDryRunning ? <Spinner className="animate-spin" /> : <ArrowPath />}
          Dry Run All Approved
        </Button>
        <Tooltip content={importDisabledReason ?? "Open the guarded live-import confirmation."}>
          <Button
            size="small"
            variant="primary"
            onClick={() => setImportModalOpen(true)}
            disabled={Boolean(importDisabledReason)}
          >
            <CurrencyDollar /> Import Approved USD Prices
          </Button>
        </Tooltip>
      </div>

      {/* ── Instructions ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <strong>Instructions:</strong> To approve a row, enter the merchant-confirmed USD amount, add a meaningful approval note,
        set the status to <strong>APPROVED</strong>, and Save. <strong>NEEDS_REVIEW</strong> rows may remain blank.
        Validate and Dry Run process only saved <strong>APPROVED</strong> rows.{" "}
        <strong>CAD prices and existing valid USD prices are never modified.</strong>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="border border-ui-border-base rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center items-center gap-x-2">
            <Spinner className="animate-spin text-ui-fg-muted" />
            <Text className="text-ui-fg-subtle">Loading review rows…</Text>
          </div>
        ) : displayedRows.length === 0 ? (
          <div className="p-12 flex flex-col justify-center items-center gap-y-2">
            <CurrencyDollar className="w-12 h-12 text-ui-fg-muted" />
            <Text className="font-semibold">No rows match the current filter</Text>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    <Checkbox
                      checked={
                        allSelected
                          ? true
                          : someSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </Table.HeaderCell>
                  <Table.HeaderCell>Product</Table.HeaderCell>
                  <Table.HeaderCell>Variant / SKU</Table.HeaderCell>
                  <Table.HeaderCell>CAD Price</Table.HeaderCell>
                  <Table.HeaderCell>Existing USD</Table.HeaderCell>
                  <Table.HeaderCell>Proposed USD</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Validation</Table.HeaderCell>
                  <Table.HeaderCell>Notes</Table.HeaderCell>
                  <Table.HeaderCell>Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {displayedRows.map((rawRow) => {
                  const row = getEffectiveRow(rawRow)
                  const isDirty = Boolean(workflowPendingEdits[row.variant_id])
                  const isSelected = selectedVariantIds.has(row.variant_id)
                  const rowLocalError = localSaveError(row)
                  const hasDraftConflict = draftConflicts.has(row.variant_id)
                  const rowWorkflowState = getRowWorkflowState(row, isDirty, validationReady)
                  const rowValidation = getRowValidation(row, rowWorkflowState === "valid")

                  return (
                    <Table.Row
                      key={row.variant_id}
                      className={`${isSelected ? "bg-ui-bg-highlight" : ""} ${isDirty ? "border-l-2 border-l-amber-400" : ""}`}
                    >
                      {/* Checkbox */}
                      <Table.Cell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectRow(row.variant_id)}
                        />
                      </Table.Cell>

                      {/* Product */}
                      <Table.Cell className="min-w-[160px]">
                        <div>
                          <Text className="font-medium text-sm">{row.product_title}</Text>
                          <Text className="text-xs text-ui-fg-muted">{row.product_handle}</Text>
                        </div>
                      </Table.Cell>

                      {/* Variant / SKU */}
                      <Table.Cell className="min-w-[140px]">
                        <div>
                          <Text className="text-sm">{row.variant_title || "Standard"}</Text>
                          <Text className="text-xs text-ui-fg-muted">{row.sku || "—"}</Text>
                        </div>
                      </Table.Cell>

                      {/* CAD Price (read-only) */}
                      <Table.Cell>
                        <Text className="text-sm text-ui-fg-subtle">{formatCad(row.current_cad_amount)}</Text>
                      </Table.Cell>

                      {/* Existing USD (read-only) */}
                      <Table.Cell>
                        <Text className="text-sm text-ui-fg-subtle">{row.existing_usd_amount ? formatUsd(row.existing_usd_amount) : "—"}</Text>
                      </Table.Cell>

                      {/* Proposed USD (editable) */}
                      <Table.Cell className="min-w-[120px]">
                        <Input
                          size="small"
                          placeholder="e.g. 19.99"
                          value={safeEditableAmount(row.proposed_usd_amount)}
                          onChange={(e) => updatePendingEdit(row.variant_id, "proposed_usd_amount", e.target.value)}
                          disabled={isRuntimeFixture}
                          className="w-28"
                        />
                      </Table.Cell>

                      {/* Status (editable) */}
                      <Table.Cell className="min-w-[140px]">
                        <Select
                          size="small"
                          value={normalizeReviewStatus(row.review_status)}
                          onValueChange={(val) => updatePendingEdit(row.variant_id, "review_status", val as ReviewStatus)}
                          disabled={isRuntimeFixture}
                        >
                          <Select.Trigger>
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Content>
                            <Select.Item value="NEEDS_REVIEW">NEEDS_REVIEW</Select.Item>
                            <Select.Item value="APPROVED">APPROVED</Select.Item>
                            <Select.Item value="REJECTED">REJECTED</Select.Item>
                          </Select.Content>
                        </Select>
                      </Table.Cell>

                      {/* Validation */}
                      <Table.Cell className="min-w-[120px]">
                        {rowValidation.state === "invalid" ? (
                          <div className="max-w-[260px]">
                            <Tooltip content={rowValidation.messages.join("; ")}>
                              <Badge color="red" className="cursor-help text-xs">
                                <XCircle className="w-3 h-3 mr-1" /> Error
                              </Badge>
                            </Tooltip>
                            <Text className="mt-1 text-xs text-red-700 whitespace-normal">{rowValidation.messages.join("; ")}</Text>
                          </div>
                        ) : hasDraftConflict ? (
                          <div className="max-w-[260px]">
                            <Badge color="orange" className="text-xs">Conflict</Badge>
                            <Text className="mt-1 text-xs text-amber-700 whitespace-normal">Server row changed; local draft was preserved.</Text>
                          </div>
                        ) : rowValidation.state === "valid" ? (
                          <Badge color="green" className="text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" /> OK
                          </Badge>
                        ) : rowValidation.state === "pending" ? (
                          <Badge color="grey" className="text-xs">Pending validation</Badge>
                        ) : row.review_status === "REJECTED" ? (
                          <Badge color="grey" className="text-xs">Rejected</Badge>
                        ) : (
                          <Badge color="grey" className="text-xs">—</Badge>
                        )}
                      </Table.Cell>

                      {/* Notes (editable) */}
                      <Table.Cell className="min-w-[180px]">
                        <Input
                          size="small"
                          placeholder="Approval note…"
                          value={safeString(row.notes)}
                          onChange={(e) => updatePendingEdit(row.variant_id, "notes", e.target.value)}
                          disabled={isRuntimeFixture}
                          className="w-44"
                        />
                      </Table.Cell>

                      {/* Actions */}
                      <Table.Cell>
                        <div className="flex items-center gap-x-1">
                          <Button
                            size="small"
                            variant="primary"
                            disabled={isRuntimeFixture || !row.variant_id || !isDirty || isSaving || apiActionsDisabled || Boolean(rowLocalError) || hasDraftConflict}
                            onClick={() => saveRow(row.variant_id)}
                          >
                            Save
                          </Button>
                          {isDirty && (
                            <Button
                              size="small"
                              variant="secondary"
                              onClick={() => resetRow(row.variant_id)}
                            >
                              Reset
                            </Button>
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table>
          </div>
        )}
      </div>

      {/* ── Import Instructions ────────────────────────────────────────────── */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>How to run the live import:</strong>
        <ol className="list-decimal list-inside mt-2 space-y-1">
          <li>Enter USD amounts and approval notes for each row you want to price.</li>
          <li>Set each row status to <strong>APPROVED</strong> and click <strong>Save</strong>.</li>
          <li>Click <strong>Validate All Approved</strong> — all rows must show <Badge color="green" className="text-xs inline-flex">OK</Badge>.</li>
          <li>Click <strong>Dry Run All Approved</strong> — verify <code>prices_to_create</code> looks correct and <code>database_writes = 0</code>.</li>
          <li>Click <strong>Import Approved USD Prices</strong>, review the exact counts, and type the required confirmation.</li>
          <li>The guarded import remains blocked if drafts, validation, dry-run proof, authentication, or connectivity are stale.</li>
        </ol>
      </div>

      <FocusModal open={importModalOpen} onOpenChange={(open) => {
        if (!isImporting) {
          setImportModalOpen(open)
          if (!open) setImportConfirmation("")
        }
      }}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Button variant="secondary" onClick={() => setImportModalOpen(false)} disabled={isImporting}>Cancel</Button>
            <Button
              variant="danger"
              onClick={executeLiveImport}
              disabled={isRuntimeFixture || isImporting || importConfirmation !== "IMPORT_APPROVED_USD_PRICES" || Boolean(importDisabledReason)}
            >
              {isImporting ? <><Spinner className="animate-spin" /> Importing...</> : "Confirm Live Import"}
            </Button>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-y-6 p-8">
            <div>
              <FocusModal.Title>Import Approved USD Prices</FocusModal.Title>
              <Text className="text-ui-fg-subtle">This creates live USD price records. It never modifies CAD or overwrites existing USD prices.</Text>
            </div>
            {isRuntimeFixture && (
              <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="runtime-fixture-import-warning">
                <strong>Runtime verification fixture:</strong> this modal is safe to inspect, but Live Import is disabled at both the Admin and API layers. No product, price, sales-channel, or merchant-review data can be written.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 max-w-xl">
              <div className="rounded border border-ui-border-base p-3"><Text className="text-xs text-ui-fg-muted">Approved rows</Text><Text className="font-semibold">{approvedCount}</Text></div>
              <div className="rounded border border-ui-border-base p-3"><Text className="text-xs text-ui-fg-muted">USD prices to create</Text><Text className="font-semibold">{dryRunResult?.prices_to_create ?? 0}</Text></div>
              <div className="rounded border border-ui-border-base p-3"><Text className="text-xs text-ui-fg-muted">Price sets to create</Text><Text className="font-semibold">{dryRunResult?.price_sets_to_create ?? 0}</Text></div>
              <div className="rounded border border-ui-border-base p-3"><Text className="text-xs text-ui-fg-muted">Dry Run timestamp</Text><Text className="font-semibold">{dryRunResult?.created_at ? new Date(dryRunResult.created_at).toLocaleString() : "Unavailable"}</Text></div>
            </div>
            <div className="rounded border border-ui-border-base p-3 max-w-xl" data-testid="usa-price-import-protections">
              <Text className="text-sm"><strong>CAD protection:</strong> CAD prices are preserved and never modified.</Text>
              <Text className="text-sm"><strong>Existing USD protection:</strong> existing USD prices are never overwritten.</Text>
            </div>
            <div className="flex flex-col gap-y-2 max-w-xl">
              <Text className="text-sm text-ui-fg-subtle">Confirmation warning: missing or incorrect text blocks submission.</Text>
              <Label htmlFor="usa-price-import-confirmation">Type IMPORT_APPROVED_USD_PRICES to confirm</Label>
              <Input
                id="usa-price-import-confirmation"
                value={importConfirmation}
                onChange={(event) => setImportConfirmation(event.target.value)}
                autoComplete="off"
                disabled={isImporting}
              />
            </div>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "USA Price Approval",
  icon: CurrencyDollar,
})

export default UsaPriceApprovalPage
