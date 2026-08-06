/**
 * POST /admin/usa-price-review/validate
 * Validates selected or all APPROVED rows.
 * Performs NO business data writes.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { REPORTS_DIR, REVIEW_CSV, parseCsv, validateProposedAmount, validateApprovalNote, writeCsv, csvMutex } from "../lib/csv-helpers"
import { fingerprintReviewRows } from "../lib/dry-run-proof"
import {
  isRuntimeVerificationFixtureEnabled,
  runtimeFixtureValidationResponse,
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
  if (isRuntimeVerificationFixtureEnabled()) {
    return res.json(runtimeFixtureValidationResponse())
  }

  const release = await csvMutex.acquire()
  try {
    if (!fs.existsSync(REVIEW_CSV)) {
      release()
      return res.status(404).json({ message: "Review CSV not found" })
    }

    const body = req.body as { variant_ids?: string[] }
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const excludedProductIds = loadExcludedProductIds()

    const allRows = parseCsv(REVIEW_CSV)
    // Filter to only APPROVED rows (optionally limited to specific variant_ids)
    const variantFilter = body?.variant_ids && Array.isArray(body.variant_ids) && body.variant_ids.length > 0
      ? new Set(body.variant_ids)
      : null

    const approvedRows = allRows.filter(
      (row) => row.review_status === "APPROVED" && (!variantFilter || variantFilter.has(row.variant_id))
    )

    if (approvedRows.length === 0) {
      release()
      return res.json({
        validated: 0,
        valid_rows: 0,
        invalid_rows: 0,
        results: [],
        message: "No APPROVED rows found to validate",
        valid_for_import: false,
        validation_fingerprint: fingerprintReviewRows([]),
        validated_at: new Date().toISOString(),
      })
    }

    // Bulk-fetch all referenced products
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
    const seen = new Set<string>()
    const results: Array<Record<string, unknown>> = []
    let validCount = 0
    let invalidCount = 0

    // Update validation_error column in the CSV
    const rowsByVariantId = new Map(allRows.map((row) => [row.variant_id, row]))

    for (const row of approvedRows) {
      const errors: string[] = []
      const variantId = row.variant_id

      // Duplicate check
      if (seen.has(variantId)) {
        errors.push("Duplicate variant_id in review CSV")
      }
      seen.add(variantId)

      // Amount validation
      const amountError = validateProposedAmount(row.proposed_usd_amount)
      if (amountError) errors.push(amountError)

      // Note validation
      const noteError = validateApprovalNote(row.notes)
      if (noteError) errors.push(noteError)

      // Product/variant existence
      const product = productById.get(row.product_id) as any
      if (!product) {
        errors.push(`product_id ${row.product_id} not found`)
      } else {
        const variant = (product.variants || []).find((v: any) => v.id === variantId)
        if (!variant) {
          errors.push(`variant_id ${variantId} does not belong to product_id ${row.product_id}`)
        } else {
          // SKU check
          if (row.sku && String(variant.sku || "") !== row.sku) {
            errors.push(`SKU mismatch: CSV has '${row.sku}', product has '${variant.sku || ""}'`)
          }
          // Published in default sales channel
          const isPublished = product.status === "published" &&
            (product.sales_channels || []).some((sc: any) => sc.id === DEFAULT_SALES_CHANNEL_ID)
          if (!isPublished) {
            errors.push("Product is not published in the Default Sales Channel")
          }
          // Classification exclusion
          if (excludedProductIds.has(row.product_id)) {
            errors.push("Product is storefront-classification-excluded and cannot receive USD prices")
          }
          // Existing USD price check
          const existingUsd = (variant.prices || []).filter(
            (p: any) => String(p.currency_code || "").toLowerCase() === "usd"
          )
          const proposedAmount = Number(row.proposed_usd_amount)
          if (existingUsd.length > 1) {
            errors.push("Variant has multiple existing USD prices and requires manual review")
          } else if (existingUsd.length === 1 && Number(existingUsd[0].amount) !== proposedAmount) {
            errors.push("Variant already has a different USD price; overwrite is not allowed")
          }
          // A missing price set is importable. Dry Run reports its creation and
          // the guarded importer creates and links it before the USD price.
        }
      }

      const isValid = errors.length === 0
      if (isValid) validCount++
      else invalidCount++

      // Update validation_error in the CSV row
      const csvRow = rowsByVariantId.get(variantId)
      if (csvRow) {
        csvRow.validation_error = errors.join("; ")
      }

      results.push({
        variant_id: variantId,
        product_id: row.product_id,
        sku: row.sku,
        proposed_usd_amount: row.proposed_usd_amount,
        valid: isValid,
        errors,
      })
    }

    // Persist validation_error updates back to CSV (atomically)
    writeCsv(REVIEW_CSV, allRows)

    release()
    return res.json({
      validated: approvedRows.length,
      valid_rows: validCount,
      invalid_rows: invalidCount,
      valid_for_import: validCount === approvedRows.length && invalidCount === 0,
      validation_fingerprint: fingerprintReviewRows(approvedRows),
      validated_at: new Date().toISOString(),
      results,
    })
  } catch (error: any) {
    release()
    console.error("[USA_PRICE_REVIEW] validate error:", error)
    return res.status(500).json({ message: error?.message || "Validation failed" })
  }
}
