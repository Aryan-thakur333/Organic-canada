import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { buildPosVariantQrPayload, assertVariantInRegisterChannel, loadRegister, mapPosVariant, normalizePosLookupCode, resolvePosVariant } from "../catalog"
import { PosError } from "../contracts"

const register = { id: "reg_ca", name: "Canada POS", sales_channel_id: "sc_pos", stock_location_id: "loc_ca", stock_location_name: "Toronto Store", region_id: "regn_ca", currency_code: "cad" }
const variant = (overrides: Record<string, unknown> = {}) => ({
  id: "variant_1", title: "1 kg", sku: "SKU-1", barcode: "0012345678905", upc: "012345678905", ean: "0012345678905", allow_backorder: false,
  prices: [{ amount: 4.99, currency_code: "cad" }, { amount: 3.99, currency_code: "usd" }],
  product: { id: "prod_1", title: "Apple", status: "published", sales_channels: [{ id: "sc_pos" }], metadata: {} },
  inventory_items: [{ inventory_item_id: "ii_1", inventory: { location_levels: [{ location_id: "loc_ca", stocked_quantity: 10, reserved_quantity: 2 }, { location_id: "loc_us", stocked_quantity: 100, reserved_quantity: 0 }] } }],
  ...overrides,
})

function requestWith(variants: unknown[]) {
  // Resolve container tokens explicitly: resolvePosVariant needs the LOGGER
  // for diagnostics and the QUERY token for the variant graph lookup.
  const logger = { info: jest.fn() }
  const query = { graph: jest.fn(async () => ({ data: variants })) }
  return {
    scope: {
      resolve: jest.fn((token: unknown) =>
        token === ContainerRegistrationKeys.LOGGER ? logger
        : token === ContainerRegistrationKeys.QUERY ? query
        : null
      ),
    },
  } as any
}

describe("POS barcode catalog", () => {
  test("normalizes control characters while preserving leading zeroes", () => expect(normalizePosLookupCode("\u000200123\r\n")).toBe("00123"))
  test("rejects empty, overlong, and unsupported input", () => {
    expect(() => normalizePosLookupCode("\r")).toThrow(PosError)
    expect(() => normalizePosLookupCode("a".repeat(129))).toThrow("at most 128")
    expect(() => normalizePosLookupCode("商品")).toThrow("unsupported")
  })
  test.each(["barcode", "upc", "ean", "sku"])("resolves an exact %s", async (field) => {
    const entry = variant({ barcode: "B", upc: "U", ean: "E", sku: "S", [field]: "MATCH" })
    await expect(resolvePosVariant(requestWith([entry]), register as any, "MATCH")).resolves.toMatchObject({ variant_id: "variant_1" })
  })
  test("uses barcode before UPC, EAN, and SKU", async () => {
    const entries = [variant({ id: "via_sku", barcode: "B1", upc: "U1", ean: "E1", sku: "MATCH" }), variant({ id: "via_barcode", barcode: "MATCH", upc: "U2", ean: "E2", sku: "S2" })]
    await expect(resolvePosVariant(requestWith(entries), register as any, "MATCH")).resolves.toMatchObject({ variant_id: "via_barcode" })
  })
  test("excludes inactive and non-POS-channel products", async () => {
    const inactive = variant({ product: { id: "p1", status: "draft", sales_channels: [{ id: "sc_pos" }] } })
    const wrongChannel = variant({ product: { id: "p2", status: "published", sales_channels: [{ id: "other" }] } })
    await expect(resolvePosVariant(requestWith([inactive]), register as any, "0012345678905")).rejects.toMatchObject({ code: "POS_PRODUCT_NOT_IN_CHANNEL" })
    await expect(resolvePosVariant(requestWith([wrongChannel]), register as any, "0012345678905")).rejects.toMatchObject({
      code: "POS_VARIANT_NOT_IN_SALES_CHANNEL",
      message: "Product is not available in this POS location.",
    })
  })
  test("QR resolves exact variant and reports product-level sales-channel eligibility", async () => {
    await expect(resolvePosVariant(requestWith([variant()]), register as any, buildPosVariantQrPayload("variant_1"))).resolves.toMatchObject({ variant_id: "variant_1", product_id: "prod_1" })
    await expect(resolvePosVariant(requestWith([variant({ product: { id: "prod_1", title: "Apple", status: "published", sales_channels: [{ id: "other" }], metadata: {} } })]), register as any, buildPosVariantQrPayload("variant_1"))).rejects.toMatchObject({
      code: "POS_VARIANT_NOT_IN_SALES_CHANNEL",
      message: "Product is not available in this POS location.",
    })
  })
  test("maps only register-location inventory and exposes its status", () => {
    expect(mapPosVariant(variant() as any, register as any)).toMatchObject({ price: { currency_code: "cad", amount_minor: 499 }, inventory: { location_id: "loc_ca", location_name: "Toronto Store", stocked_quantity: 10, reserved_quantity: 2, available_quantity: 8, status: "AVAILABLE" }, available_for_sale: true })
  })
  test("selects the register currency without cross-currency fallback", () => {
    expect(mapPosVariant(variant() as any, { ...register, currency_code: "usd" } as any).price).toMatchObject({ currency_code: "usd", amount_minor: 399 })
    expect(() => mapPosVariant(variant({ prices: [{ amount: 4.99, currency_code: "cad" }] }) as any, { ...register, currency_code: "usd" } as any)).toThrow(expect.objectContaining({ code: "POS_PRICE_UNAVAILABLE" }))
  })
  test("does not borrow another location's stock when the register location has no inventory level", () => {
    expect(() => mapPosVariant(variant({ inventory_items: [{ inventory_item_id: "ii_1", inventory: { location_levels: [{ location_id: "loc_us", stocked_quantity: 100, reserved_quantity: 0 }] } }] }) as any, register as any)).toThrow(expect.objectContaining({ code: "POS_INVENTORY_UNKNOWN" }))
  })
  test("rejects zero or missing regional prices", () => {
    expect(() => mapPosVariant(variant({ prices: [] }) as any, register as any)).toThrow("No valid CAD price")
    expect(() => mapPosVariant(variant({ prices: [{ amount: 0, currency_code: "cad" }] }) as any, register as any)).toThrow("No valid CAD price")
  })
  test("preserves an internal numeric Code 128 value as a string", async () => {
    const resolved = await resolvePosVariant(requestWith([variant({ barcode: "999999999", upc: "", ean: "" })]), register as any, "999999999")
    expect(resolved).toMatchObject({ barcode: "999999999", variant_id: "variant_1" })
  })
  test("rejects a wrong-currency price without selecting a fallback", () => {
    expect(() => mapPosVariant(variant({ prices: [{ amount: 3.99, currency_code: "usd" }] }) as any, register as any)).toThrow(expect.objectContaining({ code: "POS_PRICE_UNAVAILABLE" }))
  })
  test("assertVariantInRegisterChannel accepts variants linked to the register channel", () => {
    expect(() => assertVariantInRegisterChannel(variant() as any, register as any)).not.toThrow()
  })
  test("assertVariantInRegisterChannel rejects variants outside the register channel", () => {
    const wrongChannel = variant({ product: { id: "prod_2", title: "Apple", status: "published", sales_channels: [{ id: "other" }], metadata: {} } })
    expect(() => assertVariantInRegisterChannel(wrongChannel as any, register as any)).toThrow(expect.objectContaining({
      code: "POS_VARIANT_NOT_IN_SALES_CHANNEL",
      message: "Product is not available in this POS location.",
    }))
  })
  test("assertVariantInRegisterChannel fails closed when no sales channels are linked", () => {
    const unlinked = variant({ product: { id: "prod_3", title: "Apple", status: "published", sales_channels: [], metadata: {} } })
    expect(() => assertVariantInRegisterChannel(unlinked as any, register as any)).toThrow(expect.objectContaining({ code: "POS_VARIANT_NOT_IN_SALES_CHANNEL" }))
  })
  test("loadRegister fails closed when POS register context is incomplete", async () => {
    const req = { scope: { resolve: jest.fn(() => ({ retrievePosRegister: jest.fn(async () => ({ id: "reg_bad", sales_channel_id: "", stock_location_id: "loc_ca", currency_code: "cad" })) })) } } as any
    await expect(loadRegister(req, "reg_bad")).rejects.toMatchObject({ code: "POS_REGISTER_SALES_CHANNEL_MISSING" })
  })
})
