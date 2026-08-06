import { classifyCatalogRow } from "../../classify-storefront-catalog"

describe("storefront catalog classification", () => {
  it.each([
    ["Fresh Bananas", "fresh-bananas", "real_grocery_product"],
    ["Medusa Sweatshirt", "sweatshirt", "real_apparel_product"],
    ["Organic Master Class", "organic-master-class", "real_digital_product"],
    ["Audit Test Product 123", "audit-test", "test_or_debug_product"],
    ["An unclassified item", "unclassified", "uncertain"],
  ])("classifies %s", (product_title, product_handle, classification) => {
    expect(classifyCatalogRow({ product_title, product_handle, variant_title: "Standard" })).toBe(classification)
  })

  it("does not infer a price-based classification", () => {
    expect(classifyCatalogRow({ product_title: "Fresh Bananas", product_handle: "fresh-bananas", cad_price: "299" })).toBe("real_grocery_product")
  })
})
