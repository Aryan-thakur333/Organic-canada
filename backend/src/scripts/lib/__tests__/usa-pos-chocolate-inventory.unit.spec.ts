import * as fs from "fs"
import * as path from "path"
import {
  USA_POS_LOCATION_ID,
  evaluateUsaPosInventoryApprovals,
  type ApprovalValues,
  type UsaPosInventorySnapshot,
} from "../usa-pos-chocolate-inventory"

const snapshot: UsaPosInventorySnapshot = {
  productId: "prod_chocolate",
  productTitle: "chocolate",
  variantId: "variant_standard",
  variantTitle: "Standard",
  barcode: "999999999",
  sku: "CHOCOLATE-1",
  inventoryItemId: "iitem_chocolate",
  usaLocationId: USA_POS_LOCATION_ID,
  usaLevelId: "",
  usaLevelExists: false,
  usaLevelUpdatedAt: "",
  usaStockedQuantity: 0,
  usaReservedQuantity: 0,
  usaAvailableQuantity: 0,
  canadaLocationId: "sloc_canada",
  canadaStockedQuantity: 991,
  canadaReservedQuantity: 0,
  canadaAvailableQuantity: 991,
  globalDisplayedQuantity: 1065,
  usdPrice: 16.99,
  currencyCode: "usd",
  posChannelLinked: true,
  salesChannelId: "sc_pos",
  allowBackorder: false,
}

const now = new Date("2026-07-29T09:00:00.000Z")

function values(change: Partial<ApprovalValues> = {}): ApprovalValues {
  return {
    product_id: snapshot.productId,
    variant_id: snapshot.variantId,
    inventory_item_id: snapshot.inventoryItemId,
    stock_location_id: USA_POS_LOCATION_ID,
    current_stocked_quantity: "0",
    current_reserved_quantity: "0",
    current_available_quantity: "0",
    approved_stocked_quantity: "",
    approval_status: "PENDING",
    approved_by: "",
    approval_reference: "",
    snapshot_updated_at: "2026-07-29T08:59:53.277Z",
    notes: "",
    ...change,
  }
}

const evaluate = (rows: ApprovalValues[], options: Record<string, unknown> = {}) => evaluateUsaPosInventoryApprovals({
  rows: rows.map((entry, index) => ({ rowNumber: index + 2, values: entry })),
  snapshot,
  now,
  ...options,
})

describe("USA POS chocolate inventory approval gate", () => {
  test("keeps the generated review row pending with zero planned writes", () => {
    expect(evaluate([values()])).toMatchObject({
      rowsRead: 1,
      approvedRows: 0,
      plannedUpdates: 0,
      pendingRows: 1,
      invalidRows: 0,
      staleRows: 0,
      passed: false,
    })
  })

  test("accepts one complete exact merchant approval", () => {
    expect(evaluate([values({
      approval_status: "APPROVED",
      approved_stocked_quantity: "12",
      approved_by: "Merchant Owner",
      approval_reference: "POS-INV-20260729-001",
    })])).toMatchObject({ approvedRows: 1, plannedUpdates: 1, invalidRows: 0, staleRows: 0, passed: true })
  })

  test.each(["-1", "1.5", "abc", ""])('rejects invalid approved quantity "%s"', (approved_stocked_quantity) => {
    const result = evaluate([values({ approval_status: "APPROVED", approved_stocked_quantity, approved_by: "Merchant", approval_reference: "POS-INV-20260729-001" })])
    expect(result).toMatchObject({ invalidRows: 1, passed: false })
  })

  test("rejects blank approval identity or reference", () => {
    const result = evaluate([values({ approval_status: "APPROVED", approved_stocked_quantity: "10" })])
    expect(result).toMatchObject({ invalidRows: 1, passed: false })
    expect(result.rows[0].reasons).toEqual(expect.arrayContaining(["approved_by is required", "approval_reference is required"]))
  })

  test("rejects blank status and any non-exact approval status", () => {
    expect(evaluate([values({ approval_status: "" })])).toMatchObject({ invalidRows: 1, passed: false })
    expect(evaluate([values({ approval_status: "YES" })])).toMatchObject({ invalidRows: 1, passed: false })
  })

  test("rejects Canada or any other stock location", () => {
    const result = evaluate([values({ stock_location_id: snapshot.canadaLocationId })])
    expect(result).toMatchObject({ invalidRows: 1, passed: false })
    expect(result.rows[0].reasons).toContain("stock_location_id is not the approved USA POS location")
  })

  test("rejects duplicate target rows and duplicate approval references", () => {
    const approved = values({ approval_status: "APPROVED", approved_stocked_quantity: "9", approved_by: "Merchant", approval_reference: "POS-INV-20260729-001" })
    const result = evaluate([approved, approved])
    expect(result).toMatchObject({ rowsRead: 2, invalidRows: 1, passed: false })
    expect(result.rows[1].reasons).toEqual(expect.arrayContaining(["duplicate product/variant/inventory/location row", "duplicate approval_reference in CSV"]))
  })

  test("rejects approval references already used by another apply", () => {
    const result = evaluate([values({ approval_status: "APPROVED", approved_stocked_quantity: "9", approved_by: "Merchant", approval_reference: "POS-INV-20260729-001" })], {
      usedApprovalReferences: new Set(["POS-INV-20260729-001"]),
    })
    expect(result).toMatchObject({ invalidRows: 1, passed: false })
  })

  test("rejects changed quantities and an expired snapshot", () => {
    expect(evaluate([values({ current_stocked_quantity: "1" })])).toMatchObject({ staleRows: 1, passed: false })
    expect(evaluate([values({ snapshot_updated_at: "2026-07-20T00:00:00.000Z" })])).toMatchObject({ staleRows: 1, passed: false })
  })

  test("permits an exact audited retry after the approved write changed the live snapshot", () => {
    const approved = values({ approval_status: "APPROVED", approved_stocked_quantity: "12", approved_by: "Merchant", approval_reference: "POS-INV-20260729-001" })
    const live = { ...snapshot, usaLevelExists: true, usaLevelId: "level_us", usaLevelUpdatedAt: "2026-07-29T09:05:00.000Z", usaStockedQuantity: 12, usaAvailableQuantity: 12, globalDisplayedQuantity: 1077 }
    const result = evaluateUsaPosInventoryApprovals({
      rows: [{ rowNumber: 2, values: approved }],
      snapshot: live,
      now,
      idempotentApprovalReferences: new Set(["POS-INV-20260729-001"]),
    })
    expect(result).toMatchObject({ approvedRows: 1, plannedUpdates: 0, alreadyCorrect: 1, staleRows: 0, passed: true })
    expect(result.rows[0]).toMatchObject({ action: "NO_CHANGE", idempotentAuditMatch: true })
  })

  test("the importer uses Medusa workflows and contains no direct SQL path", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/scripts/import-approved-usa-pos-inventory.ts"), "utf8")
    expect(source).toContain("createInventoryLevelsWorkflow")
    expect(source).toContain("updateInventoryLevelsWorkflow")
    expect(source).toContain("verifyInventoryBackup")
    expect(source).not.toContain("PG_CONNECTION")
    expect(source).not.toContain(".raw(")
  })
})
