import { buildPilotApprovalRows, classifyPilotProducts, isPhysicalPilotProduct, isSuspiciousPilotProduct, POS_BARCODE_PILOT_TITLES, type PilotProduct, type PilotRegister } from "../pos-barcode-pilot"

const registers: PilotRegister[] = [
  { id: "reg-ca", name: "Canada", sales_channel_id: "sc-pos", stock_location_id: "loc-ca", region_id: "region-ca", currency_code: "cad", status: "ACTIVE" },
  { id: "reg-us", name: "USA", sales_channel_id: "sc-pos", stock_location_id: "loc-us", region_id: "region-us", currency_code: "usd", status: "ACTIVE" },
]

function product(title: string, overrides: Partial<PilotProduct> = {}): PilotProduct {
  const id = `prod-${title.toLowerCase().replace(/\W+/g, "-")}`
  return {
    id, title, handle: title.toLowerCase().replace(/\W+/g, "-"), status: "published", metadata: {}, sales_channels: [{ id: "sc-default", name: "Default" }],
    variants: [{ id: `variant-${id}`, title: "Standard", sku: `SKU-${id}`, barcode: null, upc: null, ean: null, manage_inventory: true, allow_backorder: false, prices: [{ amount: 4.99, currency_code: "cad" }, { amount: 3.99, currency_code: "usd" }], inventory_items: [{ inventory_item_id: `item-${id}`, inventory: { location_levels: [{ location_id: "loc-ca", stocked_quantity: 10, reserved_quantity: 1 }] } }] }],
    ...overrides,
  }
}

const fullCatalog = () => POS_BARCODE_PILOT_TITLES.map((title) => product(title))

describe("controlled POS barcode pilot", () => {
  test("resolves all five products by exact title", () => expect(classifyPilotProducts(fullCatalog(), "sc-pos", registers).filter((entry) => entry.resolved)).toHaveLength(5))
  test("does not silently substitute a missing title", () => expect(classifyPilotProducts(fullCatalog().slice(1), "sc-pos", registers)[0]).toMatchObject({ title: "Fresh Bananas", resolved: false, classification: "UNRESOLVED" }))
  test("blocks duplicate exact-title matches for manual resolution", () => expect(classifyPilotProducts([...fullCatalog(), product("Fresh Bananas", { id: "duplicate" })], "sc-pos", registers)[0]).toMatchObject({ resolved: false, classification: "UNRESOLVED" }))
  test("blocks a draft product", () => expect(classifyPilotProducts([product("Fresh Bananas", { status: "draft" })], "sc-pos", registers)[0].classification).toBe("INELIGIBLE_STATUS"))
  test("blocks a digital product", () => expect(classifyPilotProducts([product("Fresh Bananas", { metadata: { product_type: "digital" } })], "sc-pos", registers)[0].classification).toBe("INELIGIBLE_TYPE"))
  test("detects physical catalog products", () => expect(isPhysicalPilotProduct(product("Fresh Bananas"))).toBe(true))
  test("detects test and catalog-hold products", () => { expect(isSuspiciousPilotProduct(product("Fresh Bananas Test"))).toBe(true); expect(isSuspiciousPilotProduct(product("Fresh Bananas", { metadata: { catalog_hold: true } }))).toBe(true) })
  test("blocks a missing variant", () => expect(classifyPilotProducts([product("Fresh Bananas", { variants: [] })], "sc-pos", registers)[0].classification).toBe("MISSING_VARIANT"))
  test("blocks a missing CAD price", () => { const item = product("Fresh Bananas"); item.variants![0].prices = [{ amount: 3.99, currency_code: "usd" }]; expect(classifyPilotProducts([item], "sc-pos", registers)[0].classification).toBe("MISSING_PRICE") })
  test("requires manual review for a current unresolved suspicious CAD price", () => { const item = product("Fresh Bananas"); expect(classifyPilotProducts([item], "sc-pos", registers, new Set([item.id]))[0]).toMatchObject({ classification: "MANUAL_REVIEW", reasons: expect.arrayContaining([expect.stringContaining("merchant price approval")]) }) })
  test("blocks a missing managed inventory item", () => { const item = product("Fresh Bananas"); item.variants![0].inventory_items = []; expect(classifyPilotProducts([item], "sc-pos", registers)[0].classification).toBe("MISSING_INVENTORY_LINK") })
  test("does not treat missing USA inventory as a Canada link blocker", () => expect(classifyPilotProducts([product("Fresh Bananas")], "sc-pos", registers)[0]).toMatchObject({ classification: "ELIGIBLE", usaInventoryLinked: false, usaInventoryAvailable: false }))
  test("classifies an existing POS link as idempotently already linked", () => expect(classifyPilotProducts([product("Fresh Bananas", { sales_channels: [{ id: "sc-pos", name: "POS" }] })], "sc-pos", registers)[0].classification).toBe("ALREADY_LINKED"))
  test("accepts explicit platform ownership without inventing a vendor", () => expect(classifyPilotProducts([product("Fresh Bananas")], "sc-pos", registers)[0].vendorOwnership).toBe("PLATFORM"))
  test("prepares approval rows only for eligible linked pilot variants", () => { const catalog = fullCatalog(); catalog.forEach((entry) => entry.sales_channels = [{ id: "sc-pos", name: "POS" }]); const rows = buildPilotApprovalRows(classifyPilotProducts(catalog, "sc-pos", registers)); expect(rows).toHaveLength(5); expect(rows.every((row) => row.approved_action === "ASSIGN_INTERNAL_BARCODE" && row.pos_sales_channel_linked === "true")).toBe(true) })
  test("does not overwrite an existing barcode", () => { const item = product("Fresh Bananas", { sales_channels: [{ id: "sc-pos", name: "POS" }] }); item.variants![0].barcode = "EXISTING-CODE"; expect(buildPilotApprovalRows(classifyPilotProducts([item], "sc-pos", registers))[0]).toMatchObject({ existing_barcode: "EXISTING-CODE", approved_action: "", approval_status: "EXISTING_IDENTIFIER" }) })
  test("produces stable unique internal Code 128 values", () => { const catalog = fullCatalog(); catalog.forEach((entry) => entry.sales_channels = [{ id: "sc-pos", name: "POS" }]); const first = buildPilotApprovalRows(classifyPilotProducts(catalog, "sc-pos", registers)); const second = buildPilotApprovalRows(classifyPilotProducts(catalog, "sc-pos", registers)); expect(first.map((row) => row.approved_barcode)).toEqual(second.map((row) => row.approved_barcode)); expect(new Set(first.map((row) => row.approved_barcode)).size).toBe(5); expect(first.every((row) => /^[A-Z0-9-]+$/.test(row.approved_barcode))).toBe(true) })
})
