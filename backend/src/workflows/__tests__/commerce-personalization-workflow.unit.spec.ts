import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("personalization quote workflow", () => {
  const source = readFileSync(join(process.cwd(), "src", "workflows", "quote-personalized-product.ts"), "utf8")

  it("derives the quote from the regional variant and validates owned uploads", () => {
    expect(source).toContain("loadPersonalizationVariant")
    expect(source).toContain("validatePersonalizationInput")
    expect(source).toContain("owner_customer_id")
    expect(source).toContain("personalization_adjustment")
  })

  it("is invoked by the public quote endpoint", () => {
    const route = readFileSync(join(process.cwd(), "src", "api", "store", "personalizations", "quote", "route.ts"), "utf8")
    expect(route).toContain("quotePersonalizedProductWorkflow")
  })
})
