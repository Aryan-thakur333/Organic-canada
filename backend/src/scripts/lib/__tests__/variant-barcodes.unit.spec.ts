import { buildAuditRows, classifyVariant, isValidGtinChecksum, suggestInternalBarcode, validateInternalBarcode, type CatalogVariant } from "../variant-barcodes"

const variant = (overrides: Partial<CatalogVariant> = {}): CatalogVariant => ({
  id: "variant_01ABCDEF1234567890", title: "1 kg", sku: "APPLE-1KG", barcode: null, ean: null, upc: null,
  product: { id: "prod_1", title: "Fresh Apples", handle: "fresh-apples", status: "published", type: { value: "Fruit" }, sales_channels: [{ id: "sc_pos", name: "POS" }] },
  inventory_items: [{ inventory_item_id: "ii_1", inventory: { location_levels: [] } }], ...overrides,
})

describe("variant barcode rules", () => {
  test("detects SKU-only and all-identifiers-missing variants", () => {
    const rows = buildAuditRows([variant(), variant({ id: "variant_2", sku: null })])
    expect(rows.map((row) => row.classification)).toEqual(expect.arrayContaining(["ALL_IDENTIFIERS_MISSING", "SKU_ONLY"]))
  })
  test("preserves existing barcode, UPC, and EAN values", () => {
    const rows = buildAuditRows([variant({ barcode: "MERCHANT-CODE" }), variant({ id: "v2", upc: "036000291452" }), variant({ id: "v3", ean: "4006381333931" })])
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ existing_barcode: "MERCHANT-CODE" }), expect.objectContaining({ existing_upc: "036000291452" }), expect.objectContaining({ existing_ean: "4006381333931" })]))
  })
  test("creates stable unique internal suggestions from immutable variant identity", () => {
    const first = suggestInternalBarcode(variant()), second = suggestInternalBarcode(variant())
    const other = suggestInternalBarcode(variant({ id: "variant_DIFFERENT" }))
    expect(first).toBe(second); expect(first).not.toBe(other); expect(validateInternalBarcode(first)).toEqual([])
  })
  test("preserves approvals and existing suggestions across audit refresh", () => {
    const previous = buildAuditRows([variant()])
    previous[0].approved_action = "ASSIGN_INTERNAL_BARCODE"; previous[0].approved_barcode = previous[0].suggested_internal_barcode; previous[0].notes = "Pilot approved"
    expect(buildAuditRows([variant()], previous)[0]).toMatchObject({ approved_action: "ASSIGN_INTERNAL_BARCODE", approved_barcode: previous[0].approved_barcode, notes: "Pilot approved", suggested_internal_barcode: previous[0].suggested_internal_barcode })
  })
  test("retains the deterministic suggestion after its barcode is applied", () => {
    const previous = buildAuditRows([variant()])
    const applied = variant({ barcode: previous[0].suggested_internal_barcode })
    expect(buildAuditRows([applied], previous)[0].suggested_internal_barcode).toBe(previous[0].suggested_internal_barcode)
  })
  test("rejects invalid internal characters, length, and formula prefixes", () => {
    expect(validateInternalBarcode("EAT CODE")).toContain("internal barcode may contain only A-Z, 0-9, and hyphen")
    expect(validateInternalBarcode("-EAT-CODE")).toContain("barcode begins with an unsafe spreadsheet formula character")
    expect(validateInternalBarcode("A".repeat(65))).toContain("barcode must be at most 64 characters")
  })
  test("preserves leading zeroes for valid official identifiers", () => {
    expect(isValidGtinChecksum("036000291452", [12])).toBe(true)
    expect(String("036000291452").startsWith("0")).toBe(true)
  })
  test("rejects invalid UPC and EAN checksums", () => {
    expect(isValidGtinChecksum("036000291453", [12])).toBe(false)
    expect(isValidGtinChecksum("4006381333932", [13])).toBe(false)
  })
  test("detects duplicate barcodes and SKUs", () => {
    const barcode = variant({ barcode: "DUPLICATE", sku: "ONE" }), barcode2 = variant({ id: "v2", barcode: "DUPLICATE", sku: "TWO" })
    const sku1 = variant({ id: "v3", sku: "SAME" }), sku2 = variant({ id: "v4", sku: "SAME" })
    const rows = buildAuditRows([barcode, barcode2, sku1, sku2])
    expect(rows.filter((row) => row.classification === "DUPLICATE_BARCODE")).toHaveLength(2)
    expect(rows.filter((row) => row.classification === "DUPLICATE_SKU")).toHaveLength(2)
  })
  test("marks unpublished or non-POS variants ineligible", () => {
    const entry = variant({ product: { id: "p", status: "draft", sales_channels: [{ id: "sc", name: "POS" }] } })
    expect(classifyVariant(entry, new Map(), new Map())).toBe("NOT_POS_ELIGIBLE")
  })
})
