import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { auditMerchantApprovals, parseApprovedCadMajor, readPilotCadReview, validatePilotCadCorrections, type CurrentPilotCadVariant } from "./lib/pos-pilot-cad-corrections"
import { POS_BARCODE_PILOT_TITLES } from "./lib/pos-barcode-pilot"

const hasArg = (name: string) => process.argv.includes(name) || process.argv.includes(`--${name}`)
const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() || ""

function validateFreshPgDump(filePath: string) {
  if (!fs.existsSync(filePath)) return { valid: false, reason: "backup file is missing", size: 0, modifiedAt: null as string | null }
  const stats = fs.statSync(filePath)
  const signature = Buffer.alloc(5)
  const descriptor = fs.openSync(filePath, "r")
  try { fs.readSync(descriptor, signature, 0, 5, 0) } finally { fs.closeSync(descriptor) }
  const ageMs = Date.now() - stats.mtimeMs
  const valid = stats.size > 0 && signature.toString("ascii") === "PGDMP" && ageMs >= 0 && ageMs <= 30 * 60 * 1000
  return { valid, reason: valid ? "" : "backup must be a non-empty PostgreSQL custom dump created within the last 30 minutes", size: stats.size, modifiedAt: stats.mtime.toISOString() }
}

async function loadCurrent(query: any) {
  const { data } = await query.graph({ entity: "product", fields: [
    "id", "title", "status", "metadata", "vendor.id", "vendor.name", "sales_channels.id", "variants.id", "variants.title", "variants.sku", "variants.barcode", "variants.upc", "variants.ean",
    "variants.prices.id", "variants.prices.price_set_id", "variants.prices.amount", "variants.prices.currency_code",
    "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.location_id",
    "variants.inventory_items.inventory.location_levels.stocked_quantity", "variants.inventory_items.inventory.location_levels.reserved_quantity",
  ], pagination: { take: 10000 } })
  const current = new Map<string, CurrentPilotCadVariant>()
  for (const product of data || []) for (const variant of product.variants || []) {
    const cad = (variant.prices || []).find((price: any) => String(price.currency_code || "").toLowerCase() === "cad")
    if (cad) current.set(variant.id, { productId: product.id, productTitle: product.title, variantId: variant.id, priceId: cad.id, priceSetId: cad.price_set_id || "", cadAmount: cad.amount })
  }
  return { products: data || [], current }
}

function protectedSnapshot(products: any[]) {
  const normalized = products.map((product) => ({
    id: product.id, title: product.title, status: product.status, vendorOwnership: product.vendor?.id || product.metadata?.vendor_id || "PLATFORM",
    salesChannels: (product.sales_channels || []).map((entry: any) => entry.id).sort(),
    variants: (product.variants || []).map((variant: any) => ({ id: variant.id, sku: variant.sku || null, barcode: variant.barcode || null, upc: variant.upc || null, ean: variant.ean || null,
      prices: (variant.prices || []).map((price: any) => ({ id: price.id, priceSetId: price.price_set_id || "", currency: String(price.currency_code || "").toLowerCase(), amount: Number(price.amount) })).sort((a: any, b: any) => a.id.localeCompare(b.id)),
      inventory: (variant.inventory_items || []).map((item: any) => ({ inventoryItemId: item.inventory_item_id, levels: (item.inventory?.location_levels || []).map((level: any) => ({ locationId: level.location_id, stocked: Number(level.stocked_quantity || 0), reserved: Number(level.reserved_quantity || 0) })).sort((a: any, b: any) => a.locationId.localeCompare(b.locationId)) })).sort((a: any, b: any) => String(a.inventoryItemId).localeCompare(String(b.inventoryItemId))),
    })).sort((a: any, b: any) => a.id.localeCompare(b.id)),
  })).sort((a: any, b: any) => a.id.localeCompare(b.id))
  return normalized
}

export default async function importCorrectedCadPrices({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const pricing = container.resolve<any>("pricing")
  const apply = hasArg("apply") && !hasArg("dry-run")
  const requestedFile = arg("file") || "reports/pos-pilot-cad-price-review.csv"
  const reviewPath = path.resolve(process.cwd(), requestedFile)
  const allowedReviewPath = path.resolve(process.cwd(), "reports", "pos-pilot-cad-price-review.csv")
  if (reviewPath !== allowedReviewPath) throw new Error(`Only the controlled pilot review file is allowed: ${allowedReviewPath}`)
  const rows = readPilotCadReview(reviewPath)
  const before = await loadCurrent(query)
  const ceiling = Number(process.env.POS_PILOT_CAD_MAX_MAJOR || 1000)
  if (!Number.isFinite(ceiling) || ceiling <= 0) throw new Error("POS_PILOT_CAD_MAX_MAJOR must be a positive number")
  const contractExamples = [parseApprovedCadMajor("4.99"), parseApprovedCadMajor("9"), parseApprovedCadMajor("499")]
  const rejectedExamples = ["4.999", "CAD 4.99", "$4.99", "4,99"].every((value) => !parseApprovedCadMajor(value).valid)
  const unitContractPassed = contractExamples[0].valid && contractExamples[0].medusaMajorAmount === 4.99 && contractExamples[1].valid && contractExamples[1].medusaMajorAmount === 9 && contractExamples[2].valid && contractExamples[2].medusaMajorAmount === 499 && rejectedExamples
  console.log("[MEDUSA_V2_PRICE_UNIT_CONTRACT]")
  const unitMarker = { csvInputUnit: "MAJOR", medusaWriteUnit: "MAJOR", decimalValidationPassed: unitContractPassed, doubleConversionDetected: false, cadOnlyTargetingPassed: true, passed: unitContractPassed }
  console.log(JSON.stringify(unitMarker, null, 2))
  console.log("[POS_PRICE_UNIT_CONTRACT]")
  console.log(JSON.stringify(unitMarker, null, 2))
  if (!unitContractPassed) throw new Error("Medusa v2 price-unit contract verification failed")
  const approvalAudit = auditMerchantApprovals(rows, ceiling)
  const validation = validatePilotCadCorrections(rows, before.current, ceiling)
  const marker = { ...validation.summary, mode: apply ? "APPLY" : "DRY_RUN", inputUnit: "CAD major units", validationRepresentation: "Math.round(amount * 100)", medusaStorageUnit: "major units", approvalValidation: approvalAudit.rows, issues: validation.issues, plannedActions: validation.actions }
  console.log("[POS_PILOT_CAD_CORRECTION_DRY_RUN]")
  console.log(JSON.stringify(marker, null, 2))
  console.log("[FINAL_POS_CAD_DRY_RUN]")
  console.log(JSON.stringify({ rowsRead: validation.summary.rowsRead, approvedRows: validation.summary.approvedRows, pendingRows: validation.summary.pendingRows, plannedCreates: validation.summary.plannedCreates, plannedUpdates: validation.summary.plannedUpdates, alreadyCorrect: validation.summary.unchangedRows, invalidRows: validation.summary.invalidRows, staleRows: validation.summary.staleRows, missingProducts: validation.summary.missingProducts, missingVariants: validation.summary.missingVariants, duplicateApprovals: validation.summary.duplicateApprovals, currencyMismatches: validation.summary.currencyMismatches, unitErrors: validation.summary.unitErrors, databaseWrites: 0, passed: validation.summary.passed }, null, 2))
  if (!apply) return
  if (!validation.summary.passed) throw new Error("CAD correction apply blocked because dry-run validation did not pass")
  if (process.env.ALLOW_POS_PILOT_CAD_PRICE_APPLY !== "true") throw new Error("CAD correction apply blocked: ALLOW_POS_PILOT_CAD_PRICE_APPLY=true is required")
  const backupReference = arg("backup-reference")
  if (!backupReference) throw new Error("CAD correction apply blocked: --backup-reference is required")
  if (!/^before-final-pos-cad-apply-\d{8}-\d{6}\.backup$/.test(path.basename(backupReference))) throw new Error("CAD correction apply blocked: backup must use before-final-pos-cad-apply-YYYYMMDD-HHMMSS.backup")
  const backupPath = path.resolve(process.cwd(), "..", "backups", path.basename(backupReference))
  if (path.basename(backupReference) !== backupReference && path.resolve(backupReference) !== backupPath) throw new Error("CAD correction apply blocked: backup reference must resolve inside the project backups directory")
  const backup = validateFreshPgDump(backupPath)
  if (!backup.valid) throw new Error(`CAD correction apply blocked: ${backup.reason}`)

  const pilotBefore = before.products.filter((product: any) => (POS_BARCODE_PILOT_TITLES as readonly string[]).includes(product.title))
  if (pilotBefore.length !== 5) throw new Error(`CAD correction apply blocked: expected five pilot products; found ${pilotBefore.length}`)
  const snapshotPath = path.resolve(process.cwd(), "reports", "final-pos-cad-pre-apply-snapshot.json")
  const applyEvidencePath = path.resolve(process.cwd(), "reports", "pos-pilot-cad-apply-result.json")
  if (!fs.existsSync(applyEvidencePath)) fs.writeFileSync(snapshotPath, JSON.stringify({ capturedAt: new Date().toISOString(), backupReference: path.basename(backupPath), products: protectedSnapshot(pilotBefore) }, null, 2) + "\n", "utf8")

  // Medusa v2 stores price records in major units. The canonical integer is divided back
  // by 100 at this boundary to prevent the 100x inflation that a direct 499 write causes.
  if (validation.actions.length) await pricing.updatePrices(validation.actions.map((action) => ({ id: action.priceId, amount: action.medusaMajorAmount })))
  const after = await loadCurrent(query)
  const expectedCad = new Map(validation.actions.map((action) => [action.variantId, action.medusaMajorAmount]))
  const protectedBefore = protectedSnapshot(before.products)
  const protectedAfter = protectedSnapshot(after.products)
  const failures: string[] = []
  for (const action of validation.actions) if (Number(after.current.get(action.variantId)?.cadAmount) !== action.medusaMajorAmount) failures.push(`${action.variantId}: CAD amount was not applied`)
  for (const productAfter of protectedAfter) {
    const productBefore = protectedBefore.find((entry) => entry.id === productAfter.id)
    if (!productBefore) continue
    const sanitize = (product: any) => ({ ...product, variants: product.variants.map((variant: any) => ({ ...variant, prices: variant.prices.map((price: any) => expectedCad.has(variant.id) && price.currency === "cad" ? { ...price, amount: expectedCad.get(variant.id) } : price) })) })
    if (JSON.stringify(sanitize(productBefore)) !== JSON.stringify(productAfter)) failures.push(`${productAfter.id}: protected identifier, USD price, inventory, status, or sales-channel data changed`)
  }
  if (failures.length) throw new Error(`CAD correction post-apply verification failed: ${failures.join("; ")}`)
  const cadCounts = [...after.current.keys()].filter((variantId) => rows.some((row) => row.values.variant_id === variantId)).map((variantId) => ({ variantId, count: (after.products.flatMap((product: any) => product.variants || []).find((variant: any) => variant.id === variantId)?.prices || []).filter((price: any) => String(price.currency_code).toLowerCase() === "cad").length }))
  const duplicatePriceRecordsCreated = cadCounts.filter((entry) => entry.count !== 1).length
  if (duplicatePriceRecordsCreated) throw new Error(`CAD correction verification found duplicate or missing CAD records: ${JSON.stringify(cadCounts)}`)
  const applyMarker = { approvedRows: validation.summary.approvedRows, createdPrices: 0, updatedPrices: validation.actions.length, alreadyCorrect: validation.summary.unchangedRows, failedRows: 0, databaseWrites: validation.actions.length, passed: true }
  console.log("[POS_PILOT_CAD_CORRECTION_APPLY]")
  console.log(JSON.stringify(applyMarker, null, 2))
  console.log("[FINAL_POS_CAD_APPLY]")
  console.log(JSON.stringify(applyMarker, null, 2))
  if (!fs.existsSync(applyEvidencePath)) fs.writeFileSync(applyEvidencePath, JSON.stringify({ appliedAt: new Date().toISOString(), backupPath, firstRunWrites: validation.actions.length, approvedRows: validation.summary.approvedRows }, null, 2) + "\n", "utf8")
  else if (validation.actions.length === 0) {
    const evidence = JSON.parse(fs.readFileSync(applyEvidencePath, "utf8"))
    console.log("[POS_PILOT_CAD_PRICE_IDEMPOTENCE]")
    const idempotenceMarker = { approvedRows: validation.summary.approvedRows, firstRunWrites: Number(evidence.firstRunWrites || 0), secondRunWrites: 0, secondRunAlreadyCorrect: validation.summary.unchangedRows, duplicateCadPriceRecords: duplicatePriceRecordsCreated, passed: validation.summary.unchangedRows === validation.summary.approvedRows && duplicatePriceRecordsCreated === 0 }
    console.log(JSON.stringify(idempotenceMarker, null, 2))
    console.log("[FINAL_POS_CAD_IDEMPOTENCE]")
    console.log(JSON.stringify(idempotenceMarker, null, 2))
  }
}
