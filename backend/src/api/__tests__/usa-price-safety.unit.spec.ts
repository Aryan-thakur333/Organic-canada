import {
  clearDryRunProofForTests,
  fingerprintReviewRows,
  getRecentMatchingDryRun,
  recordSuccessfulDryRun,
} from "../admin/usa-price-review/lib/dry-run-proof"
import { normalizeMedusaPriceAmount, type ReviewRow } from "../admin/usa-price-review/lib/csv-helpers"
import { createImportId, expectedIdempotencyKey, isMatchingLedgerEntry, type ImportResult } from "../admin/usa-price-review/lib/import-ledger"
import * as fs from "fs"
import * as path from "path"
import { resolveAdminCookieOptions } from "../../lib/admin-cookie-options"

function reviewRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    product_id: "prod_test",
    product_handle: "test",
    product_title: "Test",
    variant_id: "variant_test",
    variant_title: "Default",
    sku: "TEST-1",
    current_cad_amount: "1999",
    current_cad_currency: "cad",
    existing_usd_amount: "",
    proposed_usd_amount: "19.99",
    proposal_source: "merchant",
    review_status: "APPROVED",
    validation_error: "",
    notes: "Merchant confirmed USA price",
    ...overrides,
  }
}

describe("USA price dry-run proof", () => {
  beforeEach(clearDryRunProofForTests)

  it("is deterministic and treats USD values as major-unit strings", () => {
    const first = fingerprintReviewRows([reviewRow({ proposed_usd_amount: "19.99" })])
    const second = fingerprintReviewRows([reviewRow({ proposed_usd_amount: "19.99" })])
    expect(first).toBe(second)
    expect(first).not.toBe(fingerprintReviewRows([reviewRow({ proposed_usd_amount: "1999" })]))
  })

  it("requires a recent successful matching Dry Run", () => {
    const fingerprint = fingerprintReviewRows([reviewRow()])
    expect(getRecentMatchingDryRun("missing", fingerprint, ["variant_test"], 1_000)).toBeNull()
    const proof = recordSuccessfulDryRun(fingerprint, ["variant_test"], 1_000)
    expect(getRecentMatchingDryRun(proof.dryRunId, fingerprint, ["variant_test"], 1_001)).toMatchObject({ fingerprint })
    expect(getRecentMatchingDryRun(proof.dryRunId, fingerprint, ["variant_test"], 1_000 + 16 * 60 * 1_000)).toBeNull()
  })

  it("invalidates proof when saved row content changes", () => {
    const original = fingerprintReviewRows([reviewRow()])
    const proof = recordSuccessfulDryRun(original, ["variant_test"], 1_000)
    const changed = fingerprintReviewRows([reviewRow({ notes: "Merchant changed the confirmed price" })])
    expect(getRecentMatchingDryRun(proof.dryRunId, changed, ["variant_test"], 1_001)).toBeNull()
    expect(getRecentMatchingDryRun(proof.dryRunId, original, ["different_variant"], 1_001)).toBeNull()
  })

  it.each([2, 5, 9, 19, 49, 99, 19.99])("preserves %s as a major-unit Medusa price", (amount) => {
    expect(normalizeMedusaPriceAmount(amount)).toBe(amount)
    expect(normalizeMedusaPriceAmount(String(amount))).toBe(amount)
  })

  it("builds stable import IDs and rejects a reused key with a changed proof", () => {
    const dryRunId = "dry_test_fingerprint"
    const key = expectedIdempotencyKey(dryRunId)
    expect(key).toBe("usa-price-import-dry_test_fingerprint")
    expect(createImportId(key)).toBe(createImportId(key))
    const result = { dry_run_id: dryRunId, validation_fingerprint: "fingerprint" } as ImportResult
    const entry = { dry_run_id: dryRunId, validation_fingerprint: "fingerprint", result }
    expect(isMatchingLedgerEntry(entry, dryRunId, "fingerprint")).toBe(true)
    expect(isMatchingLedgerEntry(entry, dryRunId, "changed")).toBe(false)
  })
})

describe("stable launcher safety", () => {
  const launcher = fs.readFileSync(path.resolve(process.cwd(), "scripts", "start-stable.js"), "utf8")

  it("requires both auth secrets without generating replacements", () => {
    expect(launcher).toContain('validateAuthSecrets()')
    expect(launcher).toContain('["JWT_SECRET", "COOKIE_SECRET"]')
    expect(launcher).not.toMatch(/JWT_SECRET\s*=\s*.*(?:randomBytes|randomUUID|Math\.random)/)
    expect(launcher).not.toMatch(/COOKIE_SECRET\s*=\s*.*(?:randomBytes|randomUUID|Math\.random)/)
  })

  it("does not log auth-secret values", () => {
    expect(launcher).not.toMatch(/console\.(?:log|warn|error)\([^\n]*(?:process\.env\.)?(?:JWT_SECRET|COOKIE_SECRET)[^\n]*process\.env/)
  })

  it("reports a port conflict with PID and process name where available", () => {
    expect(launcher).toContain("describePortOwner")
    expect(launcher).toContain("owner.pid")
    expect(launcher).toContain("owner.name")
    expect(launcher).toContain("Port ${PORT} conflict")
  })

  it("uses stable pre-built assets without Vite HMR", () => {
    expect(launcher).toContain("medusa start")
    expect(launcher).toContain("@vite/client")
    expect(launcher).not.toContain("medusa develop")
  })
})

describe("local stable Admin session cookie", () => {
  const configSource = fs.readFileSync(path.resolve(process.cwd(), "medusa-config.ts"), "utf8")

  it("uses HTTP-compatible cookies locally and secure cookies on HTTPS", () => {
    expect(configSource).toMatch(/cookieOptions:\s*resolveAdminCookieOptions/)
    expect(resolveAdminCookieOptions({
      backendUrl: "http://localhost:9000",
      isLocalStable: true,
      nodeEnv: "production",
    })).toEqual({ httpOnly: true, secure: false, sameSite: "lax" })
    expect(resolveAdminCookieOptions({
      backendUrl: "https://admin.eatsie.example",
      isLocalStable: false,
      nodeEnv: "production",
    })).toEqual({ httpOnly: true, secure: true, sameSite: "none" })
  })

  it("does not globally disable secure cookies", () => {
    expect(configSource).not.toMatch(/cookieOptions:\s*\{\s*secure:\s*false/)
  })
})
