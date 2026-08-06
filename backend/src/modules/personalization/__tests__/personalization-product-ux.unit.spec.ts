import fs from "fs"
import path from "path"
import PersonalizationService from "../service"
import { validateFieldConfiguration } from "../utils/field-configuration"
import { generatePersonalizationFieldKey, normalizePersonalizationFieldKeys } from "../utils/field-key"

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8")

describe("personalization product UX contract", () => {
  it("generates safe unique keys from administrator labels", () => {
    expect(generatePersonalizationFieldKey("Name on Cake")).toBe("name_on_cake")
    expect(normalizePersonalizationFieldKeys([
      { label: "Name on Cake" }, { label: "Name on Cake" }, { label: "Theme Color" },
    ]).map((item) => item.key)).toEqual(["name_on_cake", "name_on_cake_2", "theme_color"])
    expect(() => normalizePersonalizationFieldKeys([{ key: "same", label: "A" }, { key: "same", label: "B" }])).toThrow("PERSONALIZATION_FIELD_KEY_DUPLICATE")
  })

  it("mounts a product-detail widget with presets, variant assignment, preview, and generated keys", () => {
    const widget = read("src", "admin", "widgets", "product-personalization.tsx")
    expect(widget).toContain('zone: "product.details.after"')
    expect(widget).toContain("Create Draft")
    expect(widget).toContain("syncPurchaseModeToggles")
    expect(widget).toContain("props.data ?? props.product")
    expect(widget).toContain("Drawer.Title")
    expect(widget).toContain("Drawer.Description")
  })

  it("uses an active template rather than a second personalized product type", () => {
    const quote = read("src", "workflows", "quote-personalized-product.ts")
    const cart = read("src", "api", "store", "carts", "[id]", "line-items", "personalized", "route.ts")
    expect(quote).not.toContain('product_type !== "personalized"')
    expect(cart).not.toContain('product_type !== "personalized"')
    expect(quote).toContain("getActiveTemplate")
    expect(cart).toContain("getActiveTemplate")
  })

  it("keeps normal product lists free of full templates and exposes one compact active detail configuration", () => {
    const widget = read("src", "admin", "widgets", "product-personalization.tsx")
    const store = read("src", "api", "store", "products", "[id]", "personalization", "route.ts")
    expect(widget).toContain("/personalization`")
    expect(widget).not.toContain("/admin/personalization-templates\", { credentials")
    expect(store).toContain("getActiveTemplate")
    expect(store).toContain('code: "PERSONALIZATION_NOT_AVAILABLE"')
    expect(store).not.toContain("upload_references")
    expect(store).not.toContain("owner_customer_id")
    expect(store).toContain('Cache-Control')
  })

  it("hydrates fields through their existing template_id schema instead of a missing DML relation", () => {
    const service = read("src", "modules", "personalization", "service.ts")
    const detail = read("src", "api", "admin", "products", "[id]", "personalization", "route.ts")
    expect(service).toContain("getTemplateWithFields")
    expect(service).toContain("listTemplatesWithFields")
    expect(detail).toContain("listTemplatesWithFields")
    expect(detail).not.toContain('relations: ["fields"]')
  })

  it("includes the authoritative region currency in personalization price calculation", () => {
    const pricing = read("src", "modules", "personalization", "utils", "pricing.ts")
    expect(pricing).toContain('entity: "region"')
    expect(pricing).toContain('fields: ["id", "currency_code"]')
    expect(pricing).toContain("QueryContext({ region_id: regionId, currency_code: currencyCode })")
  })

  it("retains the advanced template page under its clearer label", () => {
    const page = read("src", "admin", "routes", "personalized-products", "page.tsx")
    expect(page).toContain('label: "Personalization Templates"')
  })

  it("resolves exact-variant templates before an all-variants fallback", async () => {
    const exact = { id: "ptmpl_exact", product_id: "prod_2", variant_id: "variant_2", is_active: true }
    const fallback = { id: "ptmpl_fallback", product_id: "prod_2", variant_id: null, is_active: true }
    const service: any = {
      listPersonalizationTemplates: jest.fn(async (filters: any) => filters.variant_id === "variant_2" ? [exact] : [fallback]),
      getTemplateWithFields: jest.fn(async (id: string) => ({ ...(id === exact.id ? exact : fallback), fields: [{ key: "message" }] })),
    }

    await expect(PersonalizationService.prototype.getActiveTemplate.call(service, "prod_2", "variant_2"))
      .resolves.toMatchObject({ id: "ptmpl_exact", variant_id: "variant_2" })
    expect(service.getTemplateWithFields).toHaveBeenCalledWith("ptmpl_exact")
  })

  it("uses a product-level template when no exact variant template exists", async () => {
    const fallback = { id: "ptmpl_fallback", product_id: "prod_1", variant_id: null, is_active: true }
    const service: any = {
      listPersonalizationTemplates: jest.fn(async (filters: any) => filters.variant_id ? [] : [fallback]),
      getTemplateWithFields: jest.fn(async () => ({ ...fallback, fields: [{ key: "message" }] })),
    }

    await expect(PersonalizationService.prototype.getActiveTemplate.call(service, "prod_1", "variant_any"))
      .resolves.toMatchObject({ id: "ptmpl_fallback", variant_id: null })
  })

  it("does not expose a variant-only template to the wrong variant", async () => {
    const service: any = {
      listPersonalizationTemplates: jest.fn(async () => []),
      getTemplateWithFields: jest.fn(),
    }

    await expect(PersonalizationService.prototype.getActiveTemplate.call(service, "prod_2", "variant_wrong"))
      .resolves.toBeNull()
    expect(service.getTemplateWithFields).not.toHaveBeenCalled()
  })

  it("rejects blank field labels and blank select options", () => {
    expect(() => validateFieldConfiguration({ key: "message", label: " ", field_type: "text", price_adjustment: 0 }))
      .toThrow("Personalization field label is required")
    expect(() => validateFieldConfiguration({ key: "color", label: "Color", field_type: "select", allowed_values: ["red", ""], price_adjustment: 0 }))
      .toThrow("Select fields require between 1 and 100 non-empty allowed values.")
  })
})