import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  PERSONALIZATION_PAGE_SIZE,
  buildPersonalizationFieldPayload,
  lifecycleOf,
  newPersonalizationField,
  presetFields,
  productTitleOf,
  templateActionAvailability,
  templateDraftPayload,
  validateTemplateDraft,
  variantTitleOf,
  type PersonalizationProduct,
  type PersonalizationTemplate,
  type TemplateDraft,
} from "../../lib/personalization-admin"

const product: PersonalizationProduct = {
  id: "prod_fresh_cheese",
  title: "Fresh Cheese",
  handle: "fresh-cheese",
  variants: [{ id: "variant_standard", title: "Standard" }],
}

const template = (patch: Partial<PersonalizationTemplate> = {}): PersonalizationTemplate => ({
  id: "ptmpl_1",
  title: "Fresh Cheese Personalization",
  product_id: product.id,
  variant_id: null,
  is_active: false,
  version: 1,
  field_count: 1,
  metadata: { lifecycle_status: "draft" },
  ...patch,
})

const draft = (patch: Partial<TemplateDraft> = {}): TemplateDraft => ({
  title: "Fresh Cheese Personalization",
  description: "",
  product_id: product.id,
  variant_id: "",
  allow_normal_purchase: true,
  personalization_required: false,
  fields: [newPersonalizationField("Name", "text", { key: "name" })],
  ...patch,
})

describe("personalization Admin presentation", () => {
  it("uses readable product and variant names with raw identifiers only as secondary data", () => {
    const products = new Map([[product.id, product]])
    expect(productTitleOf(template(), products)).toBe("Fresh Cheese")
    expect(variantTitleOf(template({ variant_id: "variant_standard" }), products)).toBe("Standard")
  })

  it("models Draft, Active, and Archived actions without enabling invalid transitions", () => {
    expect(lifecycleOf(template())).toBe("draft")
    expect(templateActionAvailability(template()).activate).toBe(true)
    expect(templateActionAvailability(template()).deactivate).toBe(false)

    const active = template({ is_active: true, metadata: { lifecycle_status: "active" } })
    expect(templateActionAvailability(active).activate).toBe(false)
    expect(templateActionAvailability(active).deactivate).toBe(true)

    const archived = template({ metadata: { lifecycle_status: "archived" } })
    expect(templateActionAvailability(archived).edit).toBe(false)
    expect(templateActionAvailability(archived).archive).toBe(false)
    expect(templateActionAvailability(archived).bulkAssign).toBe(false)
  })

  it("blocks activation when a field label is blank", () => {
    const issues = validateTemplateDraft(draft({ fields: [newPersonalizationField("", "text", { key: "name" })] }))
    expect(issues.map((issue) => issue.code)).toContain("PERSONALIZATION_FIELD_LABEL_REQUIRED")
  })

  it("rejects duplicate keys, select fields without options, and negative surcharges", () => {
    const issues = validateTemplateDraft(draft({
      fields: [
        newPersonalizationField("Size", "select", { key: "choice", allowed_values: "", price_adjustment: "-1" }),
        newPersonalizationField("Colour", "text", { key: "choice" }),
      ],
    }))
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "PERSONALIZATION_FIELD_KEY_DUPLICATE",
      "PERSONALIZATION_SELECT_OPTIONS_REQUIRED",
      "PERSONALIZATION_FIELD_SURCHARGE_INVALID",
    ]))
  })

  it("creates editable copies of the required presets", () => {
    const cake = presetFields("cake")
    const gift = presetFields("gift")
    const printed = presetFields("printed")
    expect(cake.map((field) => field.label)).toEqual(["Name on Cake", "Cake Message", "Theme Color", "Reference Image", "Special Instructions"])
    expect(gift.map((field) => field.label)).toEqual(["Recipient Name", "Gift Message", "Wrapping Option"])
    expect(printed.map((field) => field.label)).toEqual(["Custom Text", "Font", "Text Color", "Upload Design"])
    cake[0].label = "Edited"
    expect(presetFields("cake")[0].label).toBe("Name on Cake")
  })

  it("keeps Admin list pagination deliberately bounded", () => {
    expect(PERSONALIZATION_PAGE_SIZE).toBe(10)
  })

  it("sanitizes text fields and number fields via buildPersonalizationFieldPayload", () => {
    const textField = newPersonalizationField("Name", "text", {
      key: "name",
      min_length: "1",
      max_length: "30",
      min_value: "0",
      max_value: "100",
    })
    const textPayload = buildPersonalizationFieldPayload(textField)
    expect(textPayload.min_length).toBe(1)
    expect(textPayload.max_length).toBe(30)
    expect(textPayload).not.toHaveProperty("min_value")
    expect(textPayload).not.toHaveProperty("max_value")

    const numberField = newPersonalizationField("Age", "number", {
      key: "age",
      min_length: "1",
      max_length: "30",
      min_value: "18",
      max_value: "99",
    })
    const numberPayload = buildPersonalizationFieldPayload(numberField)
    expect(numberPayload.min_value).toBe(18)
    expect(numberPayload.max_value).toBe(99)
    expect(numberPayload).not.toHaveProperty("min_length")
    expect(numberPayload).not.toHaveProperty("max_length")

    const emptyField = newPersonalizationField("Empty", "text", {
      key: "empty",
      min_length: "",
      max_length: "",
    })
    const emptyPayload = buildPersonalizationFieldPayload(emptyField)
    expect(emptyPayload).not.toHaveProperty("min_length")
    expect(emptyPayload).not.toHaveProperty("max_length")
  })

  it("detects logical conflicts when normal purchase is allowed but personalization is required", () => {
    const badDraft = draft({
      allow_normal_purchase: true,
      personalization_required: true,
    })
    const issues = validateTemplateDraft(badDraft)
    expect(issues.map((i) => i.code)).toContain("PERSONALIZATION_REQUIRED_CONFLICT")
  })
})

describe("personalization Admin route contracts", () => {
  const pageSource = readFileSync(join(process.cwd(), "src", "admin", "routes", "personalized-products", "page.tsx"), "utf8")
  const widgetSource = readFileSync(join(process.cwd(), "src", "admin", "widgets", "product-personalization.tsx"), "utf8")

  it("renders the production table columns and management actions", () => {
    for (const column of ["Template title", "Product name", "Variant scope", "Fields", "Version", "Status", "Updated", "Actions"]) {
      expect(pageSource).toContain(column)
    }
    for (const action of ["View", "Edit", "Preview", "Activate", "Deactivate", "Duplicate", "Bulk assignment", "Archive"]) {
      expect(pageSource).toContain(`>${action}<`)
    }
  })

  it("starts new records as Draft and fetches full fields only for detail actions", () => {
    expect(pageSource).toContain("Create Draft")
    expect(pageSource).toContain("New templates stay Draft")
    expect(pageSource).toContain("fetchTemplate")
    expect(pageSource).toContain("/admin/personalization-templates/${template.id}")
    expect(pageSource).toContain("expected_version")
  })

  it("provides bounded pagination and readable bulk product selection", () => {
    expect(pageSource).toContain("limit=${PERSONALIZATION_PAGE_SIZE}&offset=${offset}")
    expect(pageSource).toContain(">Previous<")
    expect(pageSource).toContain(">Next<")
    expect(pageSource).toContain("product.title")
    expect(pageSource).not.toContain("window.prompt")
  })

  it("keeps product-detail administration available with edit, preview, disable, and archive", () => {
    expect(widgetSource).toContain("Attached template")
    expect(widgetSource).toContain("Version")
    expect(widgetSource).toContain("Updated")
    expect(widgetSource).toContain(">Edit<")
    expect(widgetSource).toContain(">Preview<")
    expect(widgetSource).toContain(">Disable<")
    expect(widgetSource).toContain(">Archive<")
  })
})
