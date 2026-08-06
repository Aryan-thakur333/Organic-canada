import fs from "fs"
import path from "path"

const root = process.cwd()
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8")

describe("POS sales-channel policy enforcement", () => {
  const checkout = read("src/api/pos/carts/[id]/checkout/route.ts")
  const search = read("src/api/pos/products/search/route.ts")

  test("checkout enforces sales-channel membership for every line item", () => {
    expect(checkout).toContain("assertVariantInRegisterChannel(variant, context.register!)")
    expect(checkout).toContain("POS_VARIANT_NOT_IN_SALES_CHANNEL")
  })

  test("checkout validates the channel before mapping/pricing the line", () => {
    const assertIndex = checkout.indexOf("assertVariantInRegisterChannel(variant, context.register!)")
    const mapIndex = checkout.indexOf("const mapped = mapPosVariant(variant, context.register!)")
    expect(assertIndex).toBeGreaterThan(-1)
    expect(mapIndex).toBeGreaterThan(-1)
    expect(assertIndex).toBeLessThan(mapIndex)
  })

  test("checkout rejects unknown variants before channel assertion", () => {
    const notFoundIndex = checkout.indexOf("POS_PRODUCT_NOT_FOUND")
    const assertIndex = checkout.indexOf("assertVariantInRegisterChannel(variant, context.register!)")
    expect(notFoundIndex).toBeGreaterThan(-1)
    expect(assertIndex).toBeGreaterThan(notFoundIndex)
  })

  test("checkout never falls back to an unscoped variant list without the assertion", () => {
    // The assertion must appear between the variant lookup and the native cart mapping.
    const lookupIndex = checkout.indexOf("variants.find((entry) => entry.id === item.variant_id)")
    const nativeCartIndex = checkout.indexOf("createPosNativeCart(req, {")
    const assert = checkout.indexOf("assertVariantInRegisterChannel(variant, context.register!)")
    expect(lookupIndex).toBeGreaterThan(-1)
    expect(nativeCartIndex).toBeGreaterThan(lookupIndex)
    expect(assert).toBeGreaterThan(lookupIndex)
    expect(assert).toBeLessThan(nativeCartIndex)
  })

  test("POS product search only surfaces variants linked to the register sales channel", () => {
    expect(search).toContain('(v.product?.sales_channels||[]).some((channel)=>channel.id===register.sales_channel_id)')
  })
})

