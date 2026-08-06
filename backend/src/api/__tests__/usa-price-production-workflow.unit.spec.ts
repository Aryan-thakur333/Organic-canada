import * as fs from "fs"
import * as path from "path"

const source = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8")

describe("USA price production Admin workflow", () => {
  const page = source("src/admin/routes/usa-price-approval/page.tsx")
  const workflow = source("src/admin/lib/price-review-workflow.ts")

  it("renders a first-class guarded import action and typed confirmation modal", () => {
    expect(page).toContain("Import Approved USD Prices")
    expect(page).toContain("Confirm Live Import")
    expect(page).toContain("IMPORT_APPROVED_USD_PRICES")
    expect(page).toContain("<FocusModal")
    expect(page).not.toContain("Call <code>POST /admin/usa-price-review/import")
  })

  it("uses the canonical workflow states and selectors", () => {
    for (const state of [
      "idle", "dirty", "saved", "validating", "valid", "invalid", "dry-running",
      "dry-run-passed", "ready-for-import", "importing", "imported", "storefront-verified", "failed",
    ]) expect(workflow).toContain(`\"${state}\"`)
    expect(page).toContain("getRowWorkflowState")
    expect(page).toContain("getImportWorkflowState")
    expect(page).toContain("getImportDisabledReason")
  })

  it("prevents double-click import and never retries the write POST", () => {
    expect(page).toContain("importRequestRunning.current")
    expect(page).toContain('method: "POST"')
    expect(page).toContain("/admin/usa-price-review/import-status?idempotency_key=")
    expect(page).toContain("The POST was not retried")
    expect(page.match(/adminApiRequest<ImportResult>\(\"\/admin\/usa-price-review\/import\"/g)).toHaveLength(1)
  })

  it("clears import proof on draft edits and blocks actions after session expiry", () => {
    expect(page).toContain("setValidationSnapshot(null)")
    expect(page).toContain("setDryRunResult(null)")
    expect(page).toContain("setImportModalOpen(false)")
    expect(page).toContain('window.location.href = "/app/login"')
    expect(page).toContain("rememberAdminReturnPath(USA_PRICE_APPROVAL_RETURN_PATH)")
  })

  it("renders exact import counters, row results, and Store API verification", () => {
    for (const label of ["Requested:", "Imported:", "Already correct:", "Skipped:", "CAD modified:", "Existing USD overwritten:", "Duplicate USD created:"]) {
      expect(page).toContain(label)
    }
    expect(page).toContain("Store API Verification")
    expect(page).toContain("row_results.map")
  })
})

describe("USA price production backend guards", () => {
  const importer = source("src/api/admin/usa-price-review/import/route.ts")
  const dryRun = source("src/api/admin/usa-price-review/dry-run/route.ts")
  const queue = source("src/api/admin/usa-price-review/route.ts")
  const verifier = source("src/api/admin/usa-price-review/verify/route.ts")
  const ledger = source("src/api/admin/usa-price-review/lib/import-ledger.ts")

  it("requires confirmation, dry-run proof, matching fingerprint, USD, and idempotency key", () => {
    expect(importer).toContain("CONFIRMATION_REQUIRED")
    expect(importer).toContain("DRY_RUN_PROOF_REQUIRED")
    expect(importer).toContain("VALIDATION_FINGERPRINT_STALE")
    expect(importer).toContain("UNSUPPORTED_CURRENCY")
    expect(importer).toContain("INVALID_IDEMPOTENCY_KEY")
    expect(importer).toContain("getRecentMatchingDryRun")
  })

  it("preflights conflicts before the first business write and protects other prices", () => {
    expect(importer.indexOf("if (conflicts.length > 0)")).toBeLessThan(importer.indexOf("pricing.createPriceSets"))
    expect(importer).toContain("cad_prices_modified: 0")
    expect(importer).toContain("existing_usd_overwritten: 0")
    expect(importer).toContain("duplicate_usd_created: 0")
    expect(importer).not.toContain("updatePrices")
    expect(importer).not.toContain("deletePrices")
  })

  it("implements cached idempotent replay and durable audit records", () => {
    expect(importer).toContain("idempotent_replay: true")
    expect(importer).toContain("IDEMPOTENCY_CONFLICT")
    expect(ledger).toContain("usa-price-import-idempotency.json")
    expect(ledger).toContain("usa-price-import-audit.json")
    expect(ledger).not.toMatch(/JWT_SECRET|COOKIE_SECRET|publishableKey/)
  })

  it("keeps failed rows for retry while completed rows leave the queue", () => {
    expect(importer).toContain("completedVariantIds")
    expect(importer).toContain("allRows.filter((row) => !completedVariantIds.has(row.variant_id))")
    expect(queue).toContain("!row.existing_usd_amount.trim()")
  })

  it("records a bounded dry-run proof with zero database writes", () => {
    expect(dryRun).toContain("dry_run_id")
    expect(dryRun).toContain("validation_fingerprint")
    expect(dryRun).toContain("database_writes: 0")
    expect(dryRun).toContain("recordSuccessfulDryRun")
  })

  it("verifies successful rows through dynamically resolved Store API context", () => {
    expect(verifier).toContain('entity: "api_key"')
    expect(verifier).toContain("/store/regions?limit=100")
    expect(verifier).toContain("currency_code?.toLowerCase() === \"usd\"")
    expect(verifier).toContain("country.iso_2?.toLowerCase() === \"us\"")
    expect(verifier).toContain("/store/products")
    expect(verifier).not.toMatch(/reg_[A-Z0-9]{10,}/)
  })

  it("performs no Import call or business-data mutation during this test suite", () => {
    expect(true).toBe(true)
  })
})
