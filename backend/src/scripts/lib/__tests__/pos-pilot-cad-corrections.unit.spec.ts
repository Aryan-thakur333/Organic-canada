import { POS_PILOT_CAD_REVIEW_HEADERS, auditMerchantApprovals, parseApprovedCadMajor, validatePilotCadCorrections, type CurrentPilotCadVariant, type PilotCadReviewRow } from "../pos-pilot-cad-corrections"

const variantId = "variant_01KVSFB7CD3CVS9WN4SCVE9YXT"
const productId = "prod_01KVSFB7BAX6R5GFXKKCC4CYHX"
const current = (amount: number) => new Map<string, CurrentPilotCadVariant>([[variantId, { productId, productTitle: "Fresh Bananas", variantId, priceId: "price_1", priceSetId: "pset_1", cadAmount: amount }]])
const row = (overrides: Partial<PilotCadReviewRow> = {}): PilotCadReviewRow => ({ ...Object.fromEntries(POS_PILOT_CAD_REVIEW_HEADERS.map((header) => [header, ""])), product_id: productId, product_title: "Fresh Bananas", variant_id: variantId, variant_title: "Standard", price_id: "price_1", price_set_id: "pset_1", currency_code: "cad", current_cad_price: "299", approved_corrected_cad_price: "2.99", approval_status: "APPROVED", approved_by: "merchant@example.test", approval_reference: "PRICE-2026-001", ...overrides } as PilotCadReviewRow)
const validate = (values: PilotCadReviewRow, amount = 299, extra: Array<{ rowNumber: number; values: PilotCadReviewRow }> = []) => validatePilotCadCorrections([{ rowNumber: 2, values }, ...extra], current(amount))

describe("POS pilot CAD correction safety", () => {
  it("canonicalizes merchant major units using Math.round(amount * 100)", () => expect(parseApprovedCadMajor("4.99")).toEqual({ valid: true, inputMajor: "4.99", minorUnits: 499, medusaMajorAmount: 4.99 }))
  it("preserves integer major-unit semantics", () => { expect(parseApprovedCadMajor("9")).toMatchObject({ medusaMajorAmount: 9, minorUnits: 900 }); expect(parseApprovedCadMajor("499")).toMatchObject({ medusaMajorAmount: 499, minorUnits: 49900 }) })
  it.each(["", "0", "-1", "NaN", "4.999", "CAD 4.99", "$4.99", "4,99", "1e2"])("rejects unsafe approval %s", (value) => expect(parseApprovedCadMajor(value).valid).toBe(false))
  it("rejects a safety-ceiling breach", () => expect(parseApprovedCadMajor("1000.01", 1000).valid).toBe(false))
  it("plans only explicit approved CAD rows", () => expect(validate(row()).summary).toMatchObject({ approvedRows: 1, plannedUpdates: 1, databaseWrites: 0, passed: true }))
  it("does not treat a pending blank row as approved", () => expect(validate(row({ approval_status: "PENDING", approved_corrected_cad_price: "" })).summary).toMatchObject({ approvedRows: 0, pendingRows: 1, plannedUpdates: 0, passed: false }))
  it("rejects a blank value on an approved row", () => expect(validate(row({ approved_corrected_cad_price: "" })).summary).toMatchObject({ unitErrors: 1, passed: false }))
  it("rejects missing or non-CAD currency", () => expect(validate(row({ currency_code: "" })).summary.currencyMismatches).toBe(1))
  it("requires approver name and reference on approved rows", () => { expect(validate(row({ approved_by: "" })).summary.invalidRows).toBe(1); expect(validate(row({ approval_reference: "" })).summary.invalidRows).toBe(1) })
  it("reports pending merchant rows without treating blanks as approval", () => expect(auditMerchantApprovals([{ rowNumber: 2, values: row({ approval_status: "PENDING", approved_corrected_cad_price: "", approved_by: "", approval_reference: "" }) }]).summary).toMatchObject({ rowsRead: 1, approvedRows: 0, pendingRows: 1, invalidApprovalRows: 0, readyForDryRun: false }))
  it("rejects unknown approval statuses", () => expect(auditMerchantApprovals([{ rowNumber: 2, values: row({ approval_status: "MAYBE" }) }]).summary.invalidApprovalRows).toBe(1))
  it("rejects lowercase approval status instead of normalizing authorization", () => {
    expect(auditMerchantApprovals([{ rowNumber: 2, values: row({ approval_status: "approved" }) }]).summary).toMatchObject({ approvedRows: 0, invalidApprovalRows: 1, readyForDryRun: false })
    expect(validate(row({ approval_status: "approved" })).summary).toMatchObject({ approvedRows: 0, invalidRows: 1, passed: false })
  })
  it("detects stale amounts and price identities", () => { expect(validate(row(), 300).summary.staleRows).toBe(1); expect(validate(row({ price_id: "old" })).summary.staleRows).toBe(1) })
  it("rejects unknown products or variants", () => expect(validate(row({ variant_id: "variant_unknown" })).summary.missingProducts).toBe(1))
  it("rejects duplicate approved variants", () => expect(validate(row(), 299, [{ rowNumber: 3, values: row() }]).summary).toMatchObject({ duplicateApprovals: 1, invalidRows: 1, passed: false }))
  it("rejects duplicate merchant approval references", () => {
    const secondVariant = "variant_01KVSFB7M7DJ2NQP1MRFC161ZP"
    const second = row({ product_id: "prod_01KVSFB7KH3MAADTC8FXDNB7K9", product_title: "Organic Carrots", variant_id: secondVariant, price_id: "price_2", price_set_id: "pset_2" })
    const approvals = auditMerchantApprovals([{ rowNumber: 2, values: row() }, { rowNumber: 3, values: second }])
    expect(approvals.summary).toMatchObject({ duplicateReferences: 1, invalidApprovalRows: 1, readyForDryRun: false })
    const variants = current(299)
    variants.set(secondVariant, { productId: second.product_id, productTitle: second.product_title, variantId: secondVariant, priceId: "price_2", priceSetId: "pset_2", cadAmount: 399 })
    expect(validatePilotCadCorrections([{ rowNumber: 2, values: row() }, { rowNumber: 3, values: second }], variants).summary).toMatchObject({ duplicateApprovals: 1, invalidRows: 1, passed: false })
  })
  it("is idempotent after the approved major-unit value is already stored", () => expect(validate(row(), 2.99).summary).toMatchObject({ plannedUpdates: 0, unchangedRows: 1, passed: true }))
})
