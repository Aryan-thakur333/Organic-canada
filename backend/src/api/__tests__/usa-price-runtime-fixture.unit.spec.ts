import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import {
  RUNTIME_FIXTURE_ENV,
  RUNTIME_FIXTURE_FINGERPRINT,
  RUNTIME_FIXTURE_PRODUCT_ID,
  RUNTIME_FIXTURE_ROW,
  RUNTIME_FIXTURE_SKU,
  RUNTIME_FIXTURE_VARIANT_ID,
  isRuntimeVerificationFixtureEnabled,
  runtimeFixtureDryRunResponse,
  runtimeFixtureImportBlockedResponse,
  runtimeFixtureReviewResponse,
  runtimeFixtureValidationResponse,
} from "../admin/usa-price-review/lib/runtime-verification-fixture"

const source = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8")
const sha256 = (filePath: string) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")

const enabledEnvironment = (): NodeJS.ProcessEnv => ({
  [RUNTIME_FIXTURE_ENV]: "true",
  EATSIE_ADMIN_RUNTIME: "stable",
  EATSIE_RUNTIME_MODE: "local-stable",
  EATSIE_LOCAL_STABLE: "true",
  EATSIE_ALLOW_FAKE_REDIS: "true",
})

describe("USA price runtime verification fixture safety", () => {
  it("defaults to disabled and cannot load from the public flag alone", () => {
    expect(isRuntimeVerificationFixtureEnabled({})).toBe(false)
    expect(isRuntimeVerificationFixtureEnabled({ [RUNTIME_FIXTURE_ENV]: "true", NODE_ENV: "production" })).toBe(false)
    expect(isRuntimeVerificationFixtureEnabled({ ...enabledEnvironment(), [RUNTIME_FIXTURE_ENV]: "false" })).toBe(false)
  })

  it("requires every explicit local-stable guard", () => {
    const env = enabledEnvironment()
    expect(isRuntimeVerificationFixtureEnabled(env)).toBe(true)
    for (const key of ["EATSIE_ADMIN_RUNTIME", "EATSIE_RUNTIME_MODE", "EATSIE_LOCAL_STABLE", "EATSIE_ALLOW_FAKE_REDIS"]) {
      expect(isRuntimeVerificationFixtureEnabled({ ...env, [key]: undefined })).toBe(false)
    }
  })

  it("returns exactly one isolated synthetic row", () => {
    const response = runtimeFixtureReviewResponse()
    expect(response.runtime_fixture).toBe(true)
    expect(response.review_rows).toHaveLength(1)
    expect(response.review_rows[0]).toMatchObject({
      product_id: RUNTIME_FIXTURE_PRODUCT_ID,
      variant_id: RUNTIME_FIXTURE_VARIANT_ID,
      sku: RUNTIME_FIXTURE_SKU,
      review_status: "APPROVED",
      existing_usd_amount: "",
    })
    expect(response.summary).toMatchObject({ total_rows: 1, approved_rows: 1, import_ready: true })
    expect(response.summary.review_fingerprint).toBe(RUNTIME_FIXTURE_FINGERPRINT)
  })

  it("validates the fixture without touching a report or database", () => {
    const response = runtimeFixtureValidationResponse(new Date("2026-01-01T00:00:00.000Z"))
    expect(response).toMatchObject({
      database_writes: 0,
      validated: 1,
      valid_rows: 1,
      invalid_rows: 0,
      valid_for_import: true,
      validation_fingerprint: RUNTIME_FIXTURE_FINGERPRINT,
    })
  })

  it("returns a read-only PASS Dry Run with one planned fixture price", () => {
    const response = runtimeFixtureDryRunResponse(new Date("2026-01-01T00:00:00.000Z"))
    expect(response).toMatchObject({
      status: "PASS",
      database_writes: 0,
      price_writes: 0,
      prices_to_create: 1,
      failed_validation: 0,
      validation_fingerprint: RUNTIME_FIXTURE_FINGERPRINT,
    })
    expect(response.planned_creates).toHaveLength(1)
    expect(response.planned_creates[0].variant_id).toBe(RUNTIME_FIXTURE_VARIANT_ID)
  })

  it("hard-blocks the Import API while fixture mode is active", () => {
    const blocked = runtimeFixtureImportBlockedResponse()
    expect(blocked).toMatchObject({
      code: "RUNTIME_FIXTURE_IMPORT_BLOCKED",
      pricing_writes: 0,
      business_data_writes: 0,
    })
    const importer = source("src/api/admin/usa-price-review/import/route.ts")
    expect(importer.indexOf("isRuntimeVerificationFixtureEnabled()"))
      .toBeLessThan(importer.indexOf("csvMutex.acquire()"))
    expect(importer.indexOf("isRuntimeVerificationFixtureEnabled()"))
      .toBeLessThan(importer.indexOf("pricing.createPriceSets"))
  })

  it("keeps the fixture read-only in the Admin and exposes the guarded modal", () => {
    const page = source("src/admin/routes/usa-price-approval/page.tsx")
    expect(page).toContain("Runtime fixture - isolated, read-only, and blocked from Import")
    expect(page).toContain("setImportModalOpen(true)")
    expect(page).toContain("runtime-fixture-import-warning")
    expect(page).toContain("<FocusModal.Title>Import Approved USD Prices</FocusModal.Title>")
    expect(page).toContain("usa-price-import-protections")
    expect(page).toContain("Approved rows")
    expect(page).toContain("USD prices to create")
    expect(page).toContain("CAD protection:")
    expect(page).toContain("Existing USD protection:")
  })

  it("blocks missing, wrong, and even valid confirmation from fixture submission", () => {
    const page = source("src/admin/routes/usa-price-approval/page.tsx")
    expect(page).toContain('if (isRuntimeFixture) return')
    expect(page).toContain('importConfirmation !== "IMPORT_APPROVED_USD_PRICES"')
    expect(page).toContain('disabled={isRuntimeFixture || isImporting || importConfirmation !== "IMPORT_APPROVED_USD_PRICES"')
    expect(page).toContain('onClick={() => setImportModalOpen(false)}')
  })

  it("does not create a fixture file or mutate the merchant review report", () => {
    const reportPath = path.resolve(process.cwd(), "reports", "usa-missing-usd-price-review.csv")
    const before = sha256(reportPath)
    runtimeFixtureReviewResponse()
    runtimeFixtureValidationResponse()
    runtimeFixtureDryRunResponse()
    expect(sha256(reportPath)).toBe(before)
    const fixtureSource = source("src/api/admin/usa-price-review/lib/runtime-verification-fixture.ts")
    expect(fixtureSource).not.toMatch(/writeFile|renameSync|copyFile|unlinkSync|createPrice|updatePrice|deletePrice/)
  })

  it("contains no real product, variant, price-set, or sales-channel identifiers", () => {
    expect(RUNTIME_FIXTURE_ROW.product_id).toBe("prod_runtime_verification_only")
    expect(RUNTIME_FIXTURE_ROW.variant_id).toBe("variant_runtime_verification_only")
    expect(JSON.stringify(runtimeFixtureReviewResponse())).not.toMatch(/prod_01|variant_01|pset_01|sc_01/)
  })
})
