/**
 * POST /admin/usa-price-review/import
 * Executes exactly one guarded, idempotent USD import after a matching dry run.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import {
  REVIEW_CSV,
  REPORTS_DIR,
  parseCsv,
  validateProposedAmount,
  validateApprovalNote,
  parseMajorAmount,
  buildUsdPriceInput,
  writeCsv,
  csvMutex,
} from "../lib/csv-helpers"
import { fingerprintReviewRows, getRecentMatchingDryRun } from "../lib/dry-run-proof"
import {
  createImportId,
  expectedIdempotencyKey,
  getImportResult,
  isMatchingLedgerEntry,
  storeImportResult,
  type ImportResult,
  type ImportRowResult,
} from "../lib/import-ledger"
import {
  isRuntimeVerificationFixtureEnabled,
  runtimeFixtureImportBlockedResponse,
} from "../lib/runtime-verification-fixture"

const EXCLUSIONS_JSON = path.resolve(REPORTS_DIR, "storefront-classification-import-exclusions.json")
const PREFLIGHT_SNAPSHOT = path.resolve(REPORTS_DIR, "usa-price-import-preflight-snapshot.json")
const IMPORT_RESULT_JSON = path.resolve(REPORTS_DIR, "final-approved-usd-price-live-import.json")
const REQUIRED_CONFIRMATION = "IMPORT_APPROVED_USD_PRICES"

type PriceRecord = { id?: string; amount?: number; currency_code?: string; price_set_id?: string }
type VariantRecord = { id: string; sku?: string; prices?: PriceRecord[] }
type ProductRecord = { id: string; title?: string; handle?: string; variants?: VariantRecord[] }
type QueryLike = {
  graph(input: Record<string, unknown>): Promise<{ data?: unknown[] }>
}
type PricingService = {
  createPriceSets(input: Array<Record<string, never>>): Promise<{ id?: string } | Array<{ id?: string }>>
  createPrices(input: Array<{ price_set_id: string; currency_code: string; amount: number; rules: Record<string, never> }>): Promise<unknown>
}
type LinkService = { create(input: Record<string, unknown>): Promise<unknown> }

function loadExcludedProductIds(): Set<string> {
  try {
    if (!fs.existsSync(EXCLUSIONS_JSON)) return new Set()
    const parsed = JSON.parse(fs.readFileSync(EXCLUSIONS_JSON, "utf8")) as {
      exclusions?: Array<{ productId?: string }>
    }
    return new Set((parsed.exclusions ?? []).map((entry) => String(entry.productId ?? "")).filter(Boolean))
  } catch {
    return new Set()
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`)
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  fs.renameSync(tempPath, filePath)
}

async function resolvePriceSetId(query: QueryLike, variant: VariantRecord): Promise<string> {
  const fromPrices = (variant.prices ?? []).find((price) => price.price_set_id)?.price_set_id
  if (fromPrices) return fromPrices
  const { data } = await query.graph({
    entity: "product_variant_price_set",
    fields: ["variant_id", "price_set_id"],
    filters: { variant_id: variant.id },
  }).catch(() => ({ data: [] }))
  const links = (data ?? []) as Array<{ price_set_id?: string }>
  return links.find((link) => link.price_set_id)?.price_set_id ?? ""
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (isRuntimeVerificationFixtureEnabled()) {
    return res.status(403).json(runtimeFixtureImportBlockedResponse())
  }

  const release = await csvMutex.acquire()
  try {
    const body = req.body as {
      confirm?: string
      dry_run_id?: string
      validation_fingerprint?: string
      variant_ids?: string[]
      currency_code?: string
    }
    const dryRunId = String(body?.dry_run_id ?? "").trim()
    const validationFingerprint = String(body?.validation_fingerprint ?? "").trim()
    const idempotencyKey = String(req.headers["idempotency-key"] ?? "").trim()

    if (body?.confirm !== REQUIRED_CONFIRMATION) {
      return res.status(400).json({
        message: "Import requires explicit confirmation.",
        code: "CONFIRMATION_REQUIRED",
        required_confirmation: REQUIRED_CONFIRMATION,
      })
    }
    if (!dryRunId || !validationFingerprint) {
      return res.status(400).json({
        message: "dry_run_id and validation_fingerprint are required.",
        code: "DRY_RUN_PROOF_REQUIRED",
      })
    }
    if (body.currency_code && body.currency_code.toLowerCase() !== "usd") {
      return res.status(400).json({ message: "Only USD imports are supported.", code: "UNSUPPORTED_CURRENCY" })
    }
    const expectedKey = expectedIdempotencyKey(dryRunId)
    if (!idempotencyKey || idempotencyKey !== expectedKey) {
      return res.status(400).json({
        message: "A matching Idempotency-Key header is required.",
        code: "INVALID_IDEMPOTENCY_KEY",
      })
    }

    const cached = getImportResult(idempotencyKey)
    if (cached) {
      if (!isMatchingLedgerEntry(cached, dryRunId, validationFingerprint)) {
        return res.status(409).json({
          message: "The idempotency key was already used for a different import proof.",
          code: "IDEMPOTENCY_CONFLICT",
        })
      }
      return res.json({ ...cached.result, idempotent_replay: true })
    }

    if (!fs.existsSync(REVIEW_CSV)) {
      return res.status(404).json({ message: "Review CSV not found" })
    }

    const allRows = parseCsv(REVIEW_CSV)
    const variantFilter = Array.isArray(body.variant_ids) && body.variant_ids.length > 0
      ? new Set(body.variant_ids)
      : null
    const approvedRows = allRows.filter((row) =>
      row.review_status === "APPROVED" &&
      !row.existing_usd_amount.trim() &&
      (!variantFilter || variantFilter.has(row.variant_id)),
    )

    if (approvedRows.length === 0) {
      return res.status(400).json({
        message: "Import blocked: no eligible APPROVED rows.",
        code: "NO_ELIGIBLE_ROWS",
        approved_rows: 0,
      })
    }

    const currentFingerprint = fingerprintReviewRows(approvedRows)
    if (validationFingerprint !== currentFingerprint) {
      return res.status(409).json({
        message: "Import blocked: saved review rows changed after validation.",
        code: "VALIDATION_FINGERPRINT_STALE",
      })
    }
    const proof = getRecentMatchingDryRun(
      dryRunId,
      currentFingerprint,
      approvedRows.map((row) => row.variant_id),
    )
    if (!proof) {
      return res.status(409).json({
        message: "Import blocked: the dry run is stale, changed, or no longer available.",
        code: "DRY_RUN_REQUIRED_OR_STALE",
      })
    }

    const seen = new Set<string>()
    const duplicateVariantIds: string[] = []
    for (const row of approvedRows) {
      if (seen.has(row.variant_id)) duplicateVariantIds.push(row.variant_id)
      seen.add(row.variant_id)
    }
    if (duplicateVariantIds.length > 0) {
      return res.status(409).json({
        message: "Import blocked: duplicate variant IDs detected.",
        code: "DUPLICATE_VARIANT_IDS",
        duplicate_variant_ids: duplicateVariantIds,
      })
    }

    const excludedProductIds = loadExcludedProductIds()
    const validationErrors: Array<{ variant_id: string; errors: string[] }> = []
    for (const row of approvedRows) {
      const errors = [
        validateProposedAmount(row.proposed_usd_amount),
        validateApprovalNote(row.notes),
        excludedProductIds.has(row.product_id) ? "Product is storefront-classification-excluded" : null,
      ].filter((error): error is string => Boolean(error))
      if (errors.length > 0) validationErrors.push({ variant_id: row.variant_id, errors })
    }
    if (validationErrors.length > 0) {
      return res.status(422).json({
        message: "Import blocked: approved rows failed validation.",
        code: "VALIDATION_FAILED",
        invalid_rows: validationErrors,
      })
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as unknown as QueryLike
    const pricing = req.scope.resolve("pricing") as unknown as PricingService
    const remoteLink = req.scope.resolve(ContainerRegistrationKeys.LINK) as unknown as LinkService
    const productIds = [...new Set(approvedRows.map((row) => row.product_id).filter(Boolean))]
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id", "title", "handle", "variants.id", "variants.sku",
        "variants.prices.id", "variants.prices.amount",
        "variants.prices.currency_code", "variants.prices.price_set_id",
      ],
      filters: { id: productIds },
    })
    const products = (data ?? []) as ProductRecord[]
    const productById = new Map(products.map((product) => [product.id, product]))

    const conflicts: Array<{ variant_id: string; reason: string }> = []
    let cadPricesPreserved = 0
    for (const row of approvedRows) {
      const product = productById.get(row.product_id)
      const variant = product?.variants?.find((entry) => entry.id === row.variant_id)
      if (!product || !variant) {
        conflicts.push({ variant_id: row.variant_id, reason: product ? "Variant not found" : "Product not found" })
        continue
      }
      cadPricesPreserved += (variant.prices ?? []).filter((price) => price.currency_code?.toLowerCase() === "cad").length
      const proposed = parseMajorAmount(row.proposed_usd_amount)
      const existingUsd = (variant.prices ?? []).filter((price) => price.currency_code?.toLowerCase() === "usd")
      if (existingUsd.length > 1) {
        conflicts.push({ variant_id: row.variant_id, reason: "Multiple existing USD prices require manual review" })
      } else if (existingUsd.length === 1 && Number(existingUsd[0].amount) !== proposed) {
        conflicts.push({ variant_id: row.variant_id, reason: "A different USD price already exists" })
      }
    }
    if (conflicts.length > 0) {
      return res.status(409).json({
        message: "Import blocked by existing data conflicts. No prices were changed.",
        code: "IMPORT_CONFLICT",
        conflicts,
      })
    }

    const timestamp = new Date().toISOString()
    const importerId = (req as unknown as { auth_context?: { actor_id?: string } }).auth_context?.actor_id ?? "authenticated-admin"
    const preflight = {
      import_id: createImportId(idempotencyKey),
      timestamp,
      importer_id: importerId,
      idempotency_key: idempotencyKey,
      dry_run_id: dryRunId,
      validation_fingerprint: validationFingerprint,
      requested: approvedRows.length,
      affected_product_ids: productIds,
      affected_variant_ids: approvedRows.map((row) => row.variant_id),
      cad_prices_preserved: cadPricesPreserved,
      existing_usd_overwritten: 0,
    }
    writeJsonAtomic(PREFLIGHT_SNAPSHOT, preflight)

    const rowResults: ImportRowResult[] = []
    const completedVariantIds = new Set<string>()
    let imported = 0
    let alreadyCorrect = 0
    let failed = 0
    let priceSetsCreated = 0

    for (const row of approvedRows) {
      const requestedUsd = parseMajorAmount(row.proposed_usd_amount)
      const product = productById.get(row.product_id)
      const variant = product?.variants?.find((entry) => entry.id === row.variant_id)
      if (requestedUsd === null || !product || !variant) {
        failed++
        rowResults.push({
          product_id: row.product_id,
          product_title: row.product_title,
          variant_id: row.variant_id,
          sku: row.sku,
          requested_usd: requestedUsd ?? 0,
          imported_usd: null,
          result: "FAILED",
          message: "The row failed the final import precondition check.",
        })
        continue
      }

      const existingUsd = (variant.prices ?? []).find((price) => price.currency_code?.toLowerCase() === "usd")
      if (existingUsd) {
        alreadyCorrect++
        completedVariantIds.add(row.variant_id)
        rowResults.push({
          product_id: row.product_id,
          product_title: row.product_title,
          variant_id: row.variant_id,
          sku: row.sku,
          requested_usd: requestedUsd,
          imported_usd: Number(existingUsd.amount),
          result: "ALREADY_CORRECT",
          message: "The matching USD price already exists; no duplicate was created.",
        })
        continue
      }

      try {
        let priceSetId = await resolvePriceSetId(query, variant)
        if (!priceSetId) {
          const created = await pricing.createPriceSets([{}])
          priceSetId = Array.isArray(created) ? created[0]?.id ?? "" : created.id ?? ""
          if (!priceSetId) throw new Error("Price set creation did not return an ID")
          await remoteLink.create({
            [Modules.PRODUCT]: { variant_id: row.variant_id },
            [Modules.PRICING]: { price_set_id: priceSetId },
          })
          priceSetsCreated++
        }

        const priceInput = buildUsdPriceInput(priceSetId, requestedUsd)
        await pricing.createPrices([priceInput])
        imported++
        completedVariantIds.add(row.variant_id)
        rowResults.push({
          product_id: row.product_id,
          product_title: row.product_title,
          variant_id: row.variant_id,
          sku: row.sku,
          requested_usd: requestedUsd,
          imported_usd: priceInput.amount,
          result: "IMPORTED",
          message: "USD price imported in major units.",
        })
      } catch (error: unknown) {
        console.error("[USA_PRICE_REVIEW] row import failed:", error)
        failed++
        rowResults.push({
          product_id: row.product_id,
          product_title: row.product_title,
          variant_id: row.variant_id,
          sku: row.sku,
          requested_usd: requestedUsd,
          imported_usd: null,
          result: "FAILED",
          message: "The USD price write failed; this row remains approved for safe retry.",
        })
      }
    }

    if (completedVariantIds.size > 0) {
      writeCsv(REVIEW_CSV, allRows.filter((row) => !completedVariantIds.has(row.variant_id)))
    }

    const result: ImportResult & { importer_id: string } = {
      status: failed > 0 ? (imported + alreadyCorrect > 0 ? "PARTIAL" : "FAILED") : "APPLIED",
      import_id: preflight.import_id,
      importer_id: importerId,
      idempotency_key: idempotencyKey,
      dry_run_id: dryRunId,
      validation_fingerprint: validationFingerprint,
      timestamp,
      requested: approvedRows.length,
      imported,
      already_correct: alreadyCorrect,
      skipped: 0,
      failed,
      price_sets_created: priceSetsCreated,
      cad_prices_modified: 0,
      existing_usd_overwritten: 0,
      duplicate_usd_created: 0,
      cad_prices_preserved: cadPricesPreserved,
      business_data_writes: imported + priceSetsCreated,
      row_results: rowResults,
    }
    storeImportResult(result)
    writeJsonAtomic(IMPORT_RESULT_JSON, result)
    return res.json(result)
  } catch (error: unknown) {
    console.error("[USA_PRICE_REVIEW] import error:", error)
    return res.status(500).json({ message: "Import failed safely. Check import status before retrying.", code: "IMPORT_FAILED" })
  } finally {
    release()
  }
}
