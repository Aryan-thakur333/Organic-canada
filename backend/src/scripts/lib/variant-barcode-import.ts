import { APPROVED_BARCODE_ACTIONS, type BarcodeAuditRow, type CatalogVariant, isPosEligible, isValidGtinChecksum, normalizeIdentifier, validateInternalBarcode } from "./variant-barcodes"

export type BarcodeImportPlan = {
  approvedRows: number
  planned: Array<{ rowNumber: number; variantId: string; barcode: string; productId: string }>
  unchangedRows: number
  duplicateValues: number
  invalidRows: number
  staleRows: number
  missingVariants: number
  ineligibleRows: number
  errors: Array<{ rowNumber: number; variantId: string; errors: string[] }>
}

export function planVariantBarcodeImport(rows: BarcodeAuditRow[], variants: CatalogVariant[]): BarcodeImportPlan {
  const byId = new Map(variants.map((variant) => [variant.id, variant]))
  const existingOwners = new Map<string, Set<string>>()
  for (const variant of variants) {
    for (const value of [variant.barcode, variant.upc, variant.ean].map(normalizeIdentifier).filter(Boolean)) {
      if (!existingOwners.has(value)) existingOwners.set(value, new Set())
      existingOwners.get(value)?.add(variant.id)
    }
  }
  const approvedCodeCounts = new Map<string, number>()
  for (const row of rows.filter((entry) => entry.approved_action === "ASSIGN_INTERNAL_BARCODE")) {
    approvedCodeCounts.set(row.approved_barcode, (approvedCodeCounts.get(row.approved_barcode) || 0) + 1)
  }
  const plan: BarcodeImportPlan = { approvedRows: 0, planned: [], unchangedRows: 0, duplicateValues: 0, invalidRows: 0, staleRows: 0, missingVariants: 0, ineligibleRows: 0, errors: [] }
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    const errors: string[] = []
    if (!(APPROVED_BARCODE_ACTIONS as readonly string[]).includes(row.approved_action)) errors.push(`unknown approved_action: ${row.approved_action}`)
    if (row.approved_action !== "ASSIGN_INTERNAL_BARCODE") {
      if (errors.length) { plan.invalidRows++; plan.errors.push({ rowNumber, variantId: row.variant_id, errors }) }
      return
    }
    plan.approvedRows++
    const variant = byId.get(row.variant_id)
    if (!variant) {
      plan.missingVariants++
      plan.errors.push({ rowNumber, variantId: row.variant_id, errors: ["variant does not exist"] })
      return
    }
    const approvedBarcode = normalizeIdentifier(row.approved_barcode)
    if (normalizeIdentifier(variant.barcode) === approvedBarcode && approvedBarcode) {
      plan.unchangedRows++
      return
    }
    errors.push(...validateInternalBarcode(approvedBarcode))
    const productId = variant.product?.id
    if (!productId || productId !== row.product_id) errors.push("product does not exist or no longer matches the audit row")
    const posEligible = isPosEligible(variant)
    if (!posEligible) errors.push("variant is not published and POS eligible")
    if (normalizeIdentifier(variant.barcode) !== row.existing_barcode) errors.push("existing barcode changed since audit")
    if (normalizeIdentifier(variant.sku) !== row.sku) errors.push("SKU changed since audit")
    if (normalizeIdentifier(variant.ean) !== row.existing_ean) errors.push("EAN changed since audit")
    if (normalizeIdentifier(variant.upc) !== row.existing_upc) errors.push("UPC changed since audit")
    if ((isPosEligible(variant) ? "true" : "false") !== row.pos_sales_channel_linked) errors.push("POS eligibility changed since audit")
    if (row.existing_ean && !isValidGtinChecksum(row.existing_ean, [8, 13, 14])) errors.push("existing EAN checksum is invalid")
    if (row.existing_upc && !isValidGtinChecksum(row.existing_upc, [12])) errors.push("existing UPC checksum is invalid")
    const owners = existingOwners.get(approvedBarcode)
    if ((owners && [...owners].some((owner) => owner !== variant.id)) || Number(approvedCodeCounts.get(approvedBarcode) || 0) > 1) {
      errors.push("barcode is already assigned or duplicated in approved rows")
      plan.duplicateValues++
    }
    if (errors.length) {
      if (errors.some((error) => error.includes("changed since audit") || error.includes("eligibility changed"))) plan.staleRows++
      else if (!posEligible) plan.ineligibleRows++
      else plan.invalidRows++
      plan.errors.push({ rowNumber, variantId: row.variant_id, errors: [...new Set(errors)] })
      return
    }
    plan.planned.push({ rowNumber, variantId: variant.id, barcode: approvedBarcode, productId: String(productId) })
  })
  return plan
}
