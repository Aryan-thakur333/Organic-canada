import { fingerprintReviewRows } from "./dry-run-proof"
import type { ReviewRow } from "./csv-helpers"

export const RUNTIME_FIXTURE_ENV = "EATSIE_RUNTIME_VERIFICATION_FIXTURE"
export const RUNTIME_FIXTURE_PRODUCT_ID = "prod_runtime_verification_only"
export const RUNTIME_FIXTURE_VARIANT_ID = "variant_runtime_verification_only"
export const RUNTIME_FIXTURE_SKU = "EATSIE-RUNTIME-VERIFY-ONLY"

export const RUNTIME_FIXTURE_ROW: ReviewRow = Object.freeze({
  product_id: RUNTIME_FIXTURE_PRODUCT_ID,
  product_handle: "runtime-verification-only",
  product_title: "Runtime Verification Product",
  variant_id: RUNTIME_FIXTURE_VARIANT_ID,
  variant_title: "Runtime Verification Variant",
  sku: RUNTIME_FIXTURE_SKU,
  current_cad_amount: "100",
  current_cad_currency: "cad",
  existing_usd_amount: "",
  proposed_usd_amount: "1.23",
  proposal_source: "RUNTIME_VERIFICATION_FIXTURE",
  review_status: "APPROVED",
  validation_error: "",
  notes: "Runtime verification only; do not import.",
})

export const RUNTIME_FIXTURE_FINGERPRINT = fingerprintReviewRows([RUNTIME_FIXTURE_ROW])
export const RUNTIME_FIXTURE_DRY_RUN_ID = `runtime-fixture-${RUNTIME_FIXTURE_FINGERPRINT.slice(0, 16)}`

/**
 * Fixture mode is deliberately impossible to activate with the public flag
 * alone. The stable launcher must also be running in its explicit local-only
 * mode, which production stable mode never enables.
 */
export function isRuntimeVerificationFixtureEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[RUNTIME_FIXTURE_ENV] === "true" &&
    env.EATSIE_ADMIN_RUNTIME === "stable" &&
    env.EATSIE_RUNTIME_MODE === "local-stable" &&
    env.EATSIE_LOCAL_STABLE === "true" &&
    env.EATSIE_ALLOW_FAKE_REDIS === "true"
}

export function runtimeFixtureReviewResponse() {
  return {
    runtime_fixture: true,
    review_rows: [{ ...RUNTIME_FIXTURE_ROW, validation_hint: "" }],
    summary: {
      total_rows: 1,
      approved_rows: 1,
      needs_review_rows: 0,
      rejected_rows: 0,
      missing_proposed_amount: 0,
      invalid_status_rows: 0,
      duplicate_variant_ids: [] as string[],
      blocked_for_import: false,
      import_ready: true,
      review_fingerprint: RUNTIME_FIXTURE_FINGERPRINT,
    },
  }
}

export function runtimeFixtureValidationResponse(now = new Date()) {
  return {
    runtime_fixture: true,
    database_writes: 0,
    validated: 1,
    valid_rows: 1,
    invalid_rows: 0,
    valid_for_import: true,
    validation_fingerprint: RUNTIME_FIXTURE_FINGERPRINT,
    validated_at: now.toISOString(),
    results: [{
      variant_id: RUNTIME_FIXTURE_VARIANT_ID,
      product_id: RUNTIME_FIXTURE_PRODUCT_ID,
      sku: RUNTIME_FIXTURE_SKU,
      proposed_usd_amount: RUNTIME_FIXTURE_ROW.proposed_usd_amount,
      valid: true,
      errors: [] as string[],
    }],
  }
}

export function runtimeFixtureDryRunResponse(now = new Date()) {
  const createdAt = now.toISOString()
  return {
    runtime_fixture: true,
    status: "PASS",
    database_writes: 0,
    price_writes: 0,
    prices_to_create: 1,
    price_sets_to_create: 0,
    already_correct: 0,
    skipped_not_approved: 0,
    skipped_classification_excluded: 0,
    failed_validation: 0,
    cad_prices_preserved: 1,
    existing_usd_prices_preserved: 0,
    cad_prices_changed: 0,
    existing_valid_usd_prices_changed: 0,
    total_reviewed: 1,
    eligible: 1,
    invalid: 0,
    skipped: 0,
    unchanged: 0,
    protected_existing_usd: 0,
    preview_fingerprint: RUNTIME_FIXTURE_FINGERPRINT,
    validation_fingerprint: RUNTIME_FIXTURE_FINGERPRINT,
    dry_run_id: RUNTIME_FIXTURE_DRY_RUN_ID,
    created_at: createdAt,
    expires_at: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    planned_creates: [{
      product_id: RUNTIME_FIXTURE_PRODUCT_ID,
      product_title: RUNTIME_FIXTURE_ROW.product_title,
      variant_id: RUNTIME_FIXTURE_VARIANT_ID,
      variant_title: RUNTIME_FIXTURE_ROW.variant_title,
      sku: RUNTIME_FIXTURE_SKU,
      price_set_id: "runtime-fixture-no-price-set",
      needs_price_set_creation: false,
      currency_code: "usd",
      amount_major: Number(RUNTIME_FIXTURE_ROW.proposed_usd_amount),
      action: "WOULD_CREATE_FIXTURE_ONLY",
    }],
    row_results: [{
      variant_id: RUNTIME_FIXTURE_VARIANT_ID,
      action: "WOULD_CREATE_FIXTURE_ONLY",
      amount_major: Number(RUNTIME_FIXTURE_ROW.proposed_usd_amount),
      price_set_id: "runtime-fixture-no-price-set",
    }],
  }
}

export function runtimeFixtureImportBlockedResponse() {
  return {
    runtime_fixture: true,
    code: "RUNTIME_FIXTURE_IMPORT_BLOCKED",
    message: "Live Import is disabled while the runtime verification fixture is active.",
    pricing_writes: 0,
    business_data_writes: 0,
  }
}

export function runtimeFixtureWriteBlockedResponse(action: string) {
  return {
    runtime_fixture: true,
    code: "RUNTIME_FIXTURE_READ_ONLY",
    message: `${action} is disabled while the read-only runtime verification fixture is active.`,
    pricing_writes: 0,
    business_data_writes: 0,
  }
}
