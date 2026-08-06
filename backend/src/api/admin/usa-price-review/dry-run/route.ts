/**
 * POST /admin/usa-price-review/dry-run
 * Calculates what a live import would do WITHOUT performing any writes.
 * Returns per-row action plan.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import {
  REVIEW_CSV,
  REPORTS_DIR,
  parseCsv,
  validateProposedAmount,
  validateApprovalNote,
  parseMajorAmount,
} from "../lib/csv-helpers"
import { fingerprintReviewRows, recordSuccessfulDryRun } from "../lib/dry-run-proof"
import {
  isRuntimeVerificationFixtureEnabled,
  runtimeFixtureDryRunResponse,
} from "../lib/runtime-verification-fixture"

const DEFAULT_SALES_CHANNEL_ID = "sc_01KVJF9HK0YY92JES8P7VPZN12"
const EXCLUSIONS_JSON = path.resolve(REPORTS_DIR, "storefront-classification-import-exclusions.json")

function loadExcludedProductIds(): Set<string> {
  try {
    if (!fs.existsSync(EXCLUSIONS_JSON)) return new Set()
    const parsed = JSON.parse(fs.readFileSync(EXCLUSIONS_JSON, "utf8"))
    const exclusions = Array.isArray(parsed.exclusions) ? parsed.exclusions : []
    return new Set(exclusions.map((e: any) => String(e.productId || "")).filter(Boolean))
  } catch {
    return new Set()
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    if (isRuntimeVerificationFixtureEnabled()) {
      return res.json(runtimeFixtureDryRunResponse())
    }

    if (!fs.existsSync(REVIEW_CSV)) {
      return res.status(404).json({ message: "Review CSV not found" })
    }

    const body = req.body as { variant_ids?: string[] }
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const excludedProductIds = loadExcludedProductIds()

    const allRows = parseCsv(REVIEW_CSV)
    const variantFilter = body?.variant_ids && Array.isArray(body.variant_ids) && body.variant_ids.length > 0
      ? new Set(body.variant_ids)
      : null

    const approvedRows = allRows.filter(
      (row) => row.review_status === "APPROVED" && (!variantFilter || variantFilter.has(row.variant_id))
    )

    // Summary counters
    let pricesToCreate = 0
    let priceSetsToCreate = 0
    let alreadyCorrect = 0
    let skippedNotApproved = 0
    let skippedClassificationExcluded = 0
    let failedValidation = 0
    let cadPricesPreserved = 0
    let existingUsdPricesPreserved = 0

    // Count skipped non-approved rows
    skippedNotApproved = allRows.filter((r) => r.review_status !== "APPROVED").length

    if (approvedRows.length === 0) {
      return res.json({
        status: "NOT_RUN_NO_APPROVED_ROWS",
        database_writes: 0,
        prices_to_create: 0,
        price_sets_to_create: 0,
        already_correct: 0,
        skipped_not_approved: skippedNotApproved,
        skipped_classification_excluded: 0,
        failed_validation: 0,
        cad_prices_preserved: 0,
        existing_usd_prices_preserved: 0,
        total_reviewed: 0,
        eligible: 0,
        invalid: 0,
        skipped: skippedNotApproved,
        unchanged: 0,
        protected_existing_usd: 0,
        row_results: [],
        planned_creates: [],
        message: "No APPROVED rows to process",
      })
    }

    // Bulk-fetch products
    const productIds = [...new Set(approvedRows.map((r) => r.product_id).filter(Boolean))]
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "status",
        "sales_channels.id",
        "variants.id",
        "variants.title",
        "variants.sku",
        "variants.prices.id",
        "variants.prices.amount",
        "variants.prices.currency_code",
        "variants.prices.price_set_id",
      ],
      filters: productIds.length ? { id: productIds } : {},
    })

    const productById = new Map((products || []).map((p: any) => [p.id, p]))

    // Accumulate CAD/USD stats from all affected products
    for (const product of products || []) {
      for (const variant of (product as any).variants || []) {
        const prices = (variant.prices || []) as any[]
        cadPricesPreserved += prices.filter((p) => String(p.currency_code || "").toLowerCase() === "cad").length
        existingUsdPricesPreserved += prices.filter((p) => String(p.currency_code || "").toLowerCase() === "usd").length
      }
    }

    const seen = new Set<string>()
    const plannedCreates: Array<Record<string, unknown>> = []
    const rowResults: Array<Record<string, unknown>> = []

    for (const row of approvedRows) {
      const variantId = row.variant_id

      // Duplicate detection
      if (seen.has(variantId)) {
        failedValidation++
        rowResults.push({ variant_id: variantId, action: "FAILED_VALIDATION", reason: "Duplicate variant_id" })
        continue
      }
      seen.add(variantId)

      // Amount validation
      const amountError = validateProposedAmount(row.proposed_usd_amount)
      if (amountError) {
        failedValidation++
        rowResults.push({ variant_id: variantId, action: "FAILED_VALIDATION", reason: amountError })
        continue
      }
      const noteError = validateApprovalNote(row.notes)
      if (noteError) {
        failedValidation++
        rowResults.push({ variant_id: variantId, action: "FAILED_VALIDATION", reason: noteError })
        continue
      }

      // Classification exclusion
      if (excludedProductIds.has(row.product_id)) {
        skippedClassificationExcluded++
        rowResults.push({ variant_id: variantId, action: "SKIPPED_CLASSIFICATION_EXCLUDED", reason: "Product is storefront-classification-excluded" })
        continue
      }

      const product = productById.get(row.product_id) as any
      if (!product) {
        failedValidation++
        rowResults.push({ variant_id: variantId, action: "FAILED_VALIDATION", reason: `product_id ${row.product_id} not found` })
        continue
      }

      const variant = (product.variants || []).find((v: any) => v.id === variantId)
      if (!variant) {
        failedValidation++
        rowResults.push({ variant_id: variantId, action: "FAILED_VALIDATION", reason: "variant_id not found in product" })
        continue
      }

      // Published in default sales channel
      const isPublished = product.status === "published" &&
        (product.sales_channels || []).some((sc: any) => sc.id === DEFAULT_SALES_CHANNEL_ID)
      if (!isPublished) {
        failedValidation++
        rowResults.push({ variant_id: variantId, action: "FAILED_VALIDATION", reason: "Product not published in Default Sales Channel" })
        continue
      }

      // Existing USD price check
      const existingUsd = (variant.prices || []).filter(
        (p: any) => String(p.currency_code || "").toLowerCase() === "usd"
      )
      if (existingUsd.length > 0) {
        const proposedAmount = parseMajorAmount(row.proposed_usd_amount)
        if (existingUsd.length === 1 && Number(existingUsd[0].amount) === proposedAmount) {
          alreadyCorrect++
          rowResults.push({ variant_id: variantId, action: "ALREADY_CORRECT", reason: "Variant already has the requested USD price" })
        } else {
          failedValidation++
          rowResults.push({ variant_id: variantId, action: "FAILED_VALIDATION", reason: "Existing USD price conflicts with the requested amount" })
        }
        continue
      }

      // Resolve price set
      let priceSetId: string = (variant.prices || []).find((p: any) => p.price_set_id)?.price_set_id || ""
      let needsPriceSet = false
      if (!priceSetId) {
        const { data: links } = await query.graph({
          entity: "product_variant_price_set",
          fields: ["variant_id", "price_set_id"],
          filters: { variant_id: variantId },
        }).catch(() => ({ data: [] }))
        priceSetId = ((links || []) as any[]).find((l) => l.price_set_id)?.price_set_id || ""
        if (!priceSetId) {
          // Would need price set creation
          needsPriceSet = true
          priceSetsToCreate++
        }
      }

      const amount = parseMajorAmount(row.proposed_usd_amount)!
      pricesToCreate++
      plannedCreates.push({
        product_id: row.product_id,
        product_title: row.product_title,
        variant_id: variantId,
        variant_title: row.variant_title,
        sku: row.sku,
        price_set_id: priceSetId,
        needs_price_set_creation: needsPriceSet,
        currency_code: "usd",
        amount_major: amount,
        action: needsPriceSet ? "PRICE_SET_CREATED_AND_PRICE_CREATED" : "CREATED",
      })
      rowResults.push({
        variant_id: variantId,
        action: needsPriceSet ? "PRICE_SET_CREATED_AND_PRICE_CREATED" : "CREATED",
        amount_major: amount,
        price_set_id: priceSetId,
      })
    }

    const status = failedValidation > 0 ? "FAIL" : "PASS"
    const previewFingerprint = fingerprintReviewRows(approvedRows)
    const proof = status === "PASS"
      ? recordSuccessfulDryRun(previewFingerprint, approvedRows.map((row) => row.variant_id))
      : null

    return res.json({
      status,
      database_writes: 0, // DRY RUN — no writes performed
      prices_to_create: pricesToCreate,
      price_sets_to_create: priceSetsToCreate,
      already_correct: alreadyCorrect,
      skipped_not_approved: skippedNotApproved,
      skipped_classification_excluded: skippedClassificationExcluded,
      failed_validation: failedValidation,
      cad_prices_preserved: cadPricesPreserved,
      existing_usd_prices_preserved: existingUsdPricesPreserved,
      cad_prices_changed: 0,
      existing_valid_usd_prices_changed: 0,
      total_reviewed: approvedRows.length,
      eligible: pricesToCreate,
      invalid: failedValidation,
      skipped: skippedNotApproved + skippedClassificationExcluded,
      unchanged: alreadyCorrect,
      protected_existing_usd: alreadyCorrect,
      preview_fingerprint: previewFingerprint,
      validation_fingerprint: previewFingerprint,
      dry_run_id: proof?.dryRunId ?? null,
      created_at: proof ? new Date(proof.createdAt).toISOString() : new Date().toISOString(),
      expires_at: proof ? new Date(proof.createdAt + 15 * 60 * 1000).toISOString() : null,
      planned_creates: plannedCreates,
      row_results: rowResults,
    })
  } catch (error: any) {
    console.error("[USA_PRICE_REVIEW] dry-run error:", error)
    return res.status(500).json({ message: error?.message || "Dry run failed" })
  }
}
