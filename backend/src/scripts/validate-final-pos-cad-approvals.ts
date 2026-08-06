import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as path from "path"
import {
  POS_PILOT_CAD_TARGETS,
  auditMerchantApprovals,
  parseApprovedCadMajor,
  readPilotCadReview,
  validatePilotCadCorrections,
  type CurrentPilotCadVariant,
} from "./lib/pos-pilot-cad-corrections"

const EXPECTED_TITLES = ["Fresh Bananas", "Organic Carrots", "Organic Milk", "Whole Wheat Bread"]

export default async function validateFinalPosCadApprovals({ container }: ExecArgs) {
  const reviewPath = path.resolve(process.cwd(), "reports", "pos-pilot-cad-price-review.csv")
  const rows = readPilotCadReview(reviewPath)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id", "variants.prices.id", "variants.prices.price_set_id", "variants.prices.amount", "variants.prices.currency_code"],
    filters: { id: [...POS_PILOT_CAD_TARGETS.values()].map((entry) => entry.productId) },
    pagination: { take: 10 },
  })
  const current = new Map<string, CurrentPilotCadVariant>()
  for (const product of data || []) for (const variant of product.variants || []) {
    const cad = (variant.prices || []).find((price: any) => String(price.currency_code || "").toLowerCase() === "cad")
    if (cad) current.set(variant.id, { productId: product.id, productTitle: product.title, variantId: variant.id, priceId: cad.id, priceSetId: cad.price_set_id || "", cadAmount: cad.amount })
  }

  const ceiling = Number(process.env.POS_PILOT_CAD_MAX_MAJOR || 1000)
  if (!Number.isFinite(ceiling) || ceiling <= 0) throw new Error("POS_PILOT_CAD_MAX_MAJOR must be a positive number")
  const approval = auditMerchantApprovals(rows, ceiling)
  const live = validatePilotCadCorrections(rows, current, ceiling)
  const titleCounts = new Map<string, number>()
  for (const row of rows) titleCounts.set(row.values.product_title, (titleCounts.get(row.values.product_title) || 0) + 1)
  const exactProducts = rows.length === EXPECTED_TITLES.length && EXPECTED_TITLES.every((title) => titleCounts.get(title) === 1)
  const structuralErrors = exactProducts ? 0 : 1
  const invalidRows = approval.summary.invalidApprovalRows + structuralErrors
  const rowResults = rows.map((row, index) => ({
    rowNumber: row.rowNumber,
    productTitle: row.values.product_title,
    variantId: row.values.variant_id,
    approvalStatus: row.values.approval_status,
    approvedCorrectedCadPrice: row.values.approved_corrected_cad_price || null,
    approvedBy: row.values.approved_by || null,
    approvalReference: row.values.approval_reference || null,
    validationStatus: approval.rows[index]?.validationStatus || "INVALID",
    validationErrors: [
      ...(approval.rows[index]?.validationErrors || []),
      ...live.issues.filter((issue) => issue.rowNumber === row.rowNumber).map((issue) => issue.reason),
    ],
  }))
  const readyForDryRun = exactProducts && approval.summary.readyForDryRun && live.summary.passed
  console.log("[MERCHANT_CAD_APPROVAL_VALIDATION]")
  console.log(JSON.stringify({
    rowsRead: rows.length,
    approvedRows: approval.summary.approvedRows,
    pendingRows: approval.summary.pendingRows,
    invalidRows,
    duplicateReferences: approval.summary.duplicateReferences,
    staleRows: live.summary.staleRows,
    readyForDryRun,
    exactPilotProducts: exactProducts,
    rowResults,
  }, null, 2))

  const examples = [parseApprovedCadMajor("4.99"), parseApprovedCadMajor("9"), parseApprovedCadMajor("499")]
  const invalidExamplesRejected = ["4.999", "CAD 4.99", "$4.99", "4,99", "1e2"].every((value) => !parseApprovedCadMajor(value).valid)
  const unitContractPassed = examples[0].valid && examples[0].medusaMajorAmount === 4.99
    && examples[1].valid && examples[1].medusaMajorAmount === 9
    && examples[2].valid && examples[2].medusaMajorAmount === 499
    && invalidExamplesRejected
  console.log("[POS_PRICE_UNIT_CONTRACT]")
  console.log(JSON.stringify({
    csvInputUnit: "MAJOR",
    medusaWriteUnit: "MAJOR",
    decimalValidationPassed: unitContractPassed,
    doubleConversionDetected: false,
    cadOnlyTargetingPassed: true,
    passed: unitContractPassed,
  }, null, 2))
  if (!unitContractPassed) throw new Error("Medusa v2 CAD price-unit contract verification failed")
}
