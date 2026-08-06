import { readFileSync } from "node:fs"
import { join } from "node:path"

const routeSource = (route: string) => readFileSync(
  join(process.cwd(), "src", "admin", "routes", route, "page.tsx"),
  "utf8"
)

describe("commerce Admin extensions", () => {
  it.each([
    ["subscriptions", "Subscriptions"],
    ["personalized-products", "Personalization Templates"],
    ["bundles", "Bundled Products"],
  ])("registers %s in the Admin sidebar", (route, label) => {
    const source = routeSource(route)
    expect(source).toContain('defineRouteConfig')
    expect(source).toContain(`label: "${label}"`)
  })

  it("keeps template creation server-authoritative", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "api", "admin", "personalization-templates", "route.ts"),
      "utf8"
    )
    expect(source).toContain("validateTemplateDefinition")
    expect(source).toContain("normalizePersonalizationFieldKeys")
    expect(source).toContain("PERSONALIZATION_PRODUCT_ID_REQUIRED")
    expect(source).toContain('status: "draft"')
    expect(source).toContain("is_active: false")
  })

  it("uses authenticated product and variant selectors instead of pasted identifiers", () => {
    const personalized = routeSource("personalized-products")
    const bundles = routeSource("bundles")
    // Phase 5-6: Product selector now uses server-side search with URLSearchParams
    // instead of a hardcoded limit=100. Verify the Admin Product API is used.
    expect(personalized).toContain('/admin/products?')
    expect(personalized).toContain("URLSearchParams")
    expect(personalized).toContain("Select a product")
    expect(bundles).toContain('fetch("/admin/products?limit=100"')
    expect(bundles).toContain("Select a component variant")
  })

  it("provides explicit archive lifecycle endpoints", () => {
    const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8")
    expect(read("api", "admin", "bundles", "[id]", "archive", "route.ts")).toContain("archived: true")
    expect(read("api", "admin", "personalization-templates", "[id]", "archive", "route.ts")).toContain("archived: true")
  })
})