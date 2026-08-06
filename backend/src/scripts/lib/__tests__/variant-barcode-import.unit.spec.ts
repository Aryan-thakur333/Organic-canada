import { planVariantBarcodeImport } from "../variant-barcode-import"
import { buildAuditRows, type CatalogVariant } from "../variant-barcodes"

const catalogVariant = (overrides: Partial<CatalogVariant> = {}): CatalogVariant => ({ id: "variant_1", title: "Default", sku: "BANANA-1", barcode: null, ean: null, upc: null, product: { id: "prod_1", title: "Fresh Bananas", status: "published", handle: "fresh-bananas", type: { value: "Fruit" }, sales_channels: [{ id: "sc_pos", name: "POS" }] }, inventory_items: [], prices: [{ amount: 4.99, currency_code: "cad" }], ...overrides })

function approved(variant = catalogVariant()) {
  const row = buildAuditRows([variant])[0]
  row.approved_action = "ASSIGN_INTERNAL_BARCODE"
  row.approved_barcode = row.suggested_internal_barcode
  return row
}

describe("approved variant barcode import planning", () => {
  test("plans one approved update without performing writes", () => expect(planVariantBarcodeImport([approved()], [catalogVariant()])).toMatchObject({ approvedRows: 1, planned: [expect.objectContaining({ variantId: "variant_1" })], invalidRows: 0 }))
  test("blocks an unknown approved action", () => { const row = approved(); row.approved_action = "AUTO_ASSIGN"; expect(planVariantBarcodeImport([row], [catalogVariant()])).toMatchObject({ invalidRows: 1, planned: [] }) })
  test("blocks a missing variant", () => expect(planVariantBarcodeImport([approved()], [])).toMatchObject({ missingVariants: 1, planned: [] }))
  test("blocks a stale barcode, SKU, UPC, and EAN snapshot", () => {
    const row = approved(); const changed = catalogVariant({ barcode: "CHANGED", sku: "CHANGED-SKU", upc: "036000291452", ean: "4006381333931" })
    expect(planVariantBarcodeImport([row], [changed])).toMatchObject({ staleRows: 1, planned: [] })
  })
  test("blocks duplicate approved values", () => {
    const first = catalogVariant(), second = catalogVariant({ id: "variant_2", sku: "BANANA-2" }); const row1 = approved(first), row2 = approved(second); row2.approved_barcode = row1.approved_barcode
    expect(planVariantBarcodeImport([row1, row2], [first, second])).toMatchObject({ duplicateValues: 2, planned: [] })
  })
  test("blocks a value already owned by another identifier field", () => {
    const row = approved(); row.approved_barcode = "EAT-EXISTING"
    const owner = catalogVariant({ id: "variant_2", sku: "OTHER", upc: "EAT-EXISTING" })
    expect(planVariantBarcodeImport([row], [catalogVariant(), owner])).toMatchObject({ duplicateValues: 1, planned: [] })
  })
  test("is idempotent when the approved barcode is already applied", () => {
    const original = catalogVariant(); const row = approved(original); const applied = catalogVariant({ barcode: row.approved_barcode })
    expect(planVariantBarcodeImport([row], [applied])).toMatchObject({ unchangedRows: 1, planned: [], invalidRows: 0, staleRows: 0 })
  })
  test("the update plan contains only identity and barcode fields", () => {
    const plan = planVariantBarcodeImport([approved()], [catalogVariant()])
    expect(Object.keys(plan.planned[0]).sort()).toEqual(["barcode", "productId", "rowNumber", "variantId"])
  })
  test("blocks invalid internal identifiers", () => { const row = approved(); row.approved_barcode = "BAD CODE"; expect(planVariantBarcodeImport([row], [catalogVariant()])).toMatchObject({ invalidRows: 1, planned: [] }) })
  test("blocks an invalid existing official checksum", () => { const current = catalogVariant({ ean: "4006381333932" }); const row = approved(current); expect(planVariantBarcodeImport([row], [current])).toMatchObject({ invalidRows: 1, planned: [] }) })
  test("skips blank, keep-existing, skip, and manual-review rows", () => {
    const rows = ["", "KEEP_EXISTING", "SKIP", "MANUAL_REVIEW"].map((action, index) => { const row = buildAuditRows([catalogVariant({ id: `v${index}` })])[0]; row.approved_action = action; return row })
    expect(planVariantBarcodeImport(rows, rows.map((row) => catalogVariant({ id: row.variant_id })))).toMatchObject({ approvedRows: 0, planned: [], invalidRows: 0 })
  })
})
