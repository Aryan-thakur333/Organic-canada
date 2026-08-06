import fs from "fs"
import path from "path"

const root = process.cwd()
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8")

describe("Admin barcode and Product Details POS QR surfaces", () => {
  test("Admin middleware protects barcode API routes", () => {
    expect(read("src/api/middlewares.ts")).toContain('matcher: "/admin/*"')
  })

  test("label endpoint preserves Code 128 and POS QR rendering without customer or payment fields", () => {
    const source = read("src/api/admin/barcodes/variants/[variantId]/label/route.ts")
    expect(source).toContain('bcid: "code128"')
    expect(source).toContain('bcid: "qrcode"')
    expect(source).toContain("EATSIE-POS:")
    expect(source).toContain("Cache-Control")
    expect(source).not.toMatch(/customer_id|payment_id|card_number|auth_token/)
  })

  test("Admin update rejects duplicates and uses the variant workflow", () => {
    const source = read("src/api/admin/barcodes/variants/[variantId]/route.ts")
    expect(source).toContain("updateProductVariantsWorkflow")
    expect(source).toContain("Identifier is already assigned")
    expect(source).toContain("REPLACE_EXISTING_IDENTIFIER")
  })

  test("standalone barcode labels Admin route is removed", () => {
    expect(fs.existsSync(path.join(root, "src/admin/routes/barcode-labels/page.tsx"))).toBe(false)
    expect(fs.existsSync(path.join(root, "src/admin/routes/barcode-labels/scan-test/[variantId]/page.tsx"))).toBe(false)
  })

  test("Product Details POS QR widget renders one safe QR card per variant", () => {
    const source = read("src/admin/widgets/product-pos-qr.tsx")
    for (const text of [
      "POS QR Codes",
      "Manage POS Availability",
      "Product-level Sales Channel Availability",
      "Canada POS",
      "USA POS",
      "Add to",
      "Remove from",
      "Available",
      "Not Available",
      "product.details.after",
      "EATSIE-POS:",
      "label_mode",
      "POS_QR",
      "No SKU",
      "Print QR",
      "Copy Code",
      "Test Scan",
    ]) {
      expect(source).toContain(text)
    }
    expect(source).not.toMatch(/customer_id|payment_id|card_number|auth_token/)
  })

  test("Product POS availability Admin routes use official additive Medusa sales-channel workflow", () => {
    const route = read("src/api/admin/pos/product-availability/route.ts")
    const helper = read("src/utils/pos/product-availability.ts")
    expect(route).toContain("addProductToPosSalesChannel")
    expect(helper).toContain("linkProductsToSalesChannelWorkflow")
    expect(helper).toContain("add: [product.id]")
    expect(helper).toContain("preserved_existing_channels")
    expect(helper).not.toMatch(/insert\s+into|delete\s+from|product_sales_channel/i)
  })

  test("Product POS availability removal is official, explicit, and preserves non-target channels", () => {
    const route = read("src/api/admin/pos/product-availability/route.ts")
    const helper = read("src/utils/pos/product-availability.ts")
    const widget = read("src/admin/widgets/product-pos-qr.tsx")
    expect(route).toContain("POS_REMOVE_CONFIRMATION_REQUIRED")
    expect(route).toContain("body.confirm !== true")
    expect(route).toContain("removeProductFromPosSalesChannel")
    expect(helper).toContain("remove: [product.id]")
    expect(helper).toContain("beforeOtherChannels")
    expect(widget).toContain("window.confirm")
    expect(widget).toContain('action: "remove"')
  })

  test("Bulk POS availability requires explicit confirmation and returns summary counts", () => {
    const bulkRoute = read("src/api/admin/pos/product-availability/bulk/route.ts")
    const helper = read("src/utils/pos/product-availability.ts")
    expect(bulkRoute).toContain("POS_BULK_CONFIRMATION_REQUIRED")
    expect(bulkRoute).toContain("body.confirm !== true")
    for (const text of ["productsRead", "linked", "alreadyLinked", "skipped", "errors"]) {
      expect(helper).toContain(text)
    }
  })

  test("POS auto assign policy is safe off by default", () => {
    const helper = read("src/utils/pos/product-availability.ts")
    const envTemplate = read(".env.template")
    expect(helper).toContain('POS_AUTO_ASSIGN_CANADA_CHANNEL || "false"')
    expect(helper).toContain('POS_AUTO_ASSIGN_USA_CHANNEL || "false"')
    expect(envTemplate).toContain("POS_AUTO_ASSIGN_CANADA_CHANNEL=false")
    expect(envTemplate).toContain("POS_AUTO_ASSIGN_USA_CHANNEL=false")
  })
})
