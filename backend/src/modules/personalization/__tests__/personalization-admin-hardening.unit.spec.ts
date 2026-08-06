import fs from "fs"
import path from "path"
import PersonalizationService from "../service"
import { PersonalizationDomainError } from "../errors"
import { validateFieldConfiguration } from "../utils/field-configuration"
import {
  getTemplateLifecycleStatus,
  normalizedTemplateTitleKey,
  validateTemplateDefinition,
  validateTemplateTitle,
} from "../utils/template-validation"
import { GET as listTemplates } from "../../../api/admin/personalization-templates/route"
import { PUT as updateTemplate } from "../../../api/admin/personalization-templates/[id]/route"
import { GET as getStoreTemplate } from "../../../api/store/products/[id]/personalization/route"

const validField = (overrides: Record<string, unknown> = {}) => ({
  id: "pfld_1",
  key: "message",
  label: "Message",
  field_type: "text",
  is_required: true,
  min_length: 1,
  max_length: 100,
  min_value: null,
  max_value: null,
  allowed_values: null,
  placeholder: null,
  help_text: null,
  price_adjustment: 0,
  sort_order: 0,
  validation_rules: null,
  ...overrides,
})

function responseRecorder() {
  const state: { status?: number; body?: any; headers: Record<string, unknown> } = {
    headers: {},
  }
  const response: any = {
    status: jest.fn((status: number) => {
      state.status = status
      return response
    }),
    json: jest.fn((body: any) => {
      state.body = body
      return response
    }),
    setHeader: jest.fn((name: string, value: unknown) => {
      state.headers[name] = value
    }),
  }
  return { response, state }
}

describe("personalization template Admin hardening", () => {
  it("normalizes titles within an assignment and rejects blank titles", () => {
    expect(validateTemplateTitle("  Personal   Product  ")).toBe("Personal Product")
    expect(normalizedTemplateTitleKey(" PERSONAL PRODUCT ")).toBe("personal product")
    expect(() => validateTemplateTitle("   ")).toThrow(
      expect.objectContaining({ code: "PERSONALIZATION_TEMPLATE_TITLE_REQUIRED" })
    )
  })

  it.each([
    [{ key: "", label: "Label" }, "PERSONALIZATION_FIELD_KEY_REQUIRED"],
    [{ key: "message", label: " " }, "PERSONALIZATION_FIELD_LABEL_REQUIRED"],
    // Select fields never carry text length/range props from the admin payload
    // (buildPersonalizationFieldPayload strips them), so the fixture clears
    // them to test the options check in isolation.
    [{ key: "choice", label: "Choice", field_type: "select", allowed_values: [], min_length: null, max_length: null, min_value: null, max_value: null }, "PERSONALIZATION_SELECT_OPTIONS_REQUIRED"],
    [{ key: "message", label: "Message", price_adjustment: -1 }, "PERSONALIZATION_FIELD_SURCHARGE_INVALID"],
    [{ key: "message", label: "Message", sort_order: -1 }, "PERSONALIZATION_FIELD_SORT_ORDER_INVALID"],
  ])("returns a stable activation validation code", (patch, code) => {
    try {
      validateFieldConfiguration({ ...validField(), ...patch })
      throw new Error("expected validation to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(PersonalizationDomainError)
      expect((error as PersonalizationDomainError).code).toBe(code)
    }
  })

  it("rejects duplicate field keys and permits no fields only for a draft", () => {
    expect(() => validateTemplateDefinition({
      title: "Safe",
      fields: [validField(), validField({ id: "pfld_2", label: "Again" })],
    })).toThrow(expect.objectContaining({ code: "PERSONALIZATION_FIELD_KEY_DUPLICATE" }))
    expect(validateTemplateDefinition({ title: "Draft", fields: [], requireFields: false }).fields).toEqual([])
    expect(() => validateTemplateDefinition({ title: "Active", fields: [] })).toThrow(
      expect.objectContaining({ code: "PERSONALIZATION_TEMPLATE_FIELDS_REQUIRED" })
    )
  })

  it("treats archived metadata as archived even if a legacy active flag is stale", () => {
    expect(getTemplateLifecycleStatus({
      status: "active",
      is_active: true,
      metadata: { lifecycle_status: "archived" },
    })).toBe("archived")
  })

  it("rejects duplicate active product and variant assignments with precise codes", async () => {
    const active = { id: "ptmpl_other", is_active: true, status: "active", deleted_at: null }
    // The service delegates to listActiveAssignmentConflicts, which internally
    // reuses listPersonalizationTemplates in production.
    const service: any = {
      listActiveAssignmentConflicts: jest.fn(async () => [active]),
    }
    await expect(PersonalizationService.prototype.assertActiveAssignmentAvailable.call(service, {
      productId: "prod_1",
      variantId: null,
    })).rejects.toMatchObject({ code: "PERSONALIZATION_PRODUCT_TEMPLATE_ALREADY_ACTIVE", status: 409 })
    await expect(PersonalizationService.prototype.assertActiveAssignmentAvailable.call(service, {
      productId: "prod_1",
      variantId: "variant_1",
    })).rejects.toMatchObject({ code: "PERSONALIZATION_VARIANT_TEMPLATE_ALREADY_ACTIVE", status: 409 })
  })

  it("rejects confusing case-normalized titles only within the same product scope", async () => {
    const service: any = {
      listPersonalizationTemplates: jest.fn(async () => [{
        id: "ptmpl_existing",
        product_id: "prod_1",
        variant_id: null,
        title: "Personal Product",
        status: "draft",
        is_active: false,
      }]),
    }
    await expect(PersonalizationService.prototype.assertUniqueTemplateTitle.call(service, {
      productId: "prod_1",
      variantId: null,
      title: " PERSONAL   PRODUCT ",
    })).rejects.toMatchObject({ code: "PERSONALIZATION_TEMPLATE_TITLE_DUPLICATE", status: 409 })
  })

  it("uses exact variant precedence and rejects ambiguous legacy assignments", async () => {
    const exact = { id: "ptmpl_exact", is_active: true, status: "active", deleted_at: null }
    const fallback = { id: "ptmpl_fallback", is_active: true, status: "active", deleted_at: null }
    const service: any = {
      listPersonalizationTemplates: jest.fn(async (filters: any) =>
        filters.variant_id === "variant_1" ? [exact] : [fallback]
      ),
      getTemplateWithFields: jest.fn(async (id: string) => ({ id, fields: [validField()] })),
    }
    await expect(PersonalizationService.prototype.getActiveTemplate.call(
      service,
      "prod_1",
      "variant_1"
    )).resolves.toMatchObject({ id: "ptmpl_exact" })

    service.listPersonalizationTemplates.mockResolvedValueOnce([
      exact,
      { ...exact, id: "ptmpl_duplicate" },
    ])
    await expect(PersonalizationService.prototype.getActiveTemplate.call(
      service,
      "prod_1",
      "variant_1"
    )).rejects.toMatchObject({ code: "PERSONALIZATION_TEMPLATE_AMBIGUOUS", status: 409 })
  })

  it("creates an active same-title edit as a separate Draft and leaves the active row untouched", async () => {
    const updatedAt = "2026-07-30T10:00:00.000Z"
    const current = {
      id: "ptmpl_1",
      product_id: "prod_1",
      variant_id: null,
      vendor_id: "vendor_1",
      title: "Personal Product",
      description: null,
      status: "active",
      is_active: true,
      version: 3,
      schema_hash: "sha256:old",
      published_at: "2026-07-29T10:00:00.000Z",
      updated_at: updatedAt,
      metadata: { lifecycle_status: "active" },
      requires_vendor_approval: false,
      requires_production: false,
      fields: [validField()],
    }
    const child = {
      ...current,
      id: "ptmpl_2",
      version: 4,
      status: "draft",
      is_active: false,
      published_at: null,
      updated_at: "2026-07-30T10:01:00.000Z",
      metadata: {
        lifecycle_status: "draft",
        version_lineage_id: "ptmpl_1",
        source_template_id: "ptmpl_1",
      },
    }
    const service: any = {
      getTemplateWithFields: jest.fn(async () => current),
      assertUniqueTemplateTitle: jest.fn(async () => undefined),
      assertActiveAssignmentAvailable: jest.fn(async () => undefined),
      updatePersonalizationTemplates: jest.fn(async () => undefined),
      deletePersonalizationFields: jest.fn(async () => undefined),
      createPersonalizationFields: jest.fn(async () => validField()),
      createPersonalizationTemplates: jest.fn(async () => child),
      getNextTemplateVersion: jest.fn(async () => 4),
      publishTemplate: jest.fn(),
    }
    const query = { graph: jest.fn(async () => ({ data: [{ id: "prod_1", metadata: {}, variants: [] }] })) }
    const req: any = {
      params: { id: "ptmpl_1" },
      body: {
        title: " Personal Product ",
        expected_version: 3,
        expected_updated_at: updatedAt,
        create_new_version: true,
        is_active: true,
        fields: [validField()],
      },
      headers: {},
      scope: { resolve: (key: string) => key === "query" ? query : service },
    }
    const { response, state } = responseRecorder()
    await updateTemplate(req, response)

    expect(state.status).toBe(201)
    expect(service.assertUniqueTemplateTitle).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Personal Product",
        excludeTemplateId: "ptmpl_1",
        versionLineageId: "ptmpl_1",
      })
    )
    expect(service.createPersonalizationTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Personal Product",
        version: 4,
        is_active: false,
        status: "draft",
        product_id: "prod_1",
        variant_id: null,
        vendor_id: "vendor_1",
        metadata: expect.objectContaining({
          version_lineage_id: "ptmpl_1",
          source_template_id: "ptmpl_1",
          supersedes_template_id: "ptmpl_1",
        }),
      })
    )
    // A new version draft is created fresh: no id is ever passed to the service.
    expect(service.createPersonalizationTemplates).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.anything() })
    )
    expect(service.updatePersonalizationTemplates).not.toHaveBeenCalled()
    expect(service.deletePersonalizationFields).not.toHaveBeenCalled()
    expect(service.publishTemplate).not.toHaveBeenCalled()
    expect(state.body.active_template_preserved).toBe(true)
    expect(state.body.source_template_id).toBe("ptmpl_1")
    expect(state.body.template.version).toBe(4)
    expect(state.body.template.status).toBe("DRAFT")
  })

  it("returns a paginated summary with names and one batched field-count query", async () => {
    const service: any = {
      listAndCountPersonalizationTemplates: jest.fn(async () => [[{
        id: "ptmpl_1",
        product_id: "prod_1",
        variant_id: "variant_1",
        title: "Cake",
        version: 2,
        status: "active",
        is_active: true,
        metadata: {},
      }], 1]),
      listTemplateFieldCounts: jest.fn(async () => new Map([["ptmpl_1", 5]])),
    }
    // The list route performs one batched product query and one batched
    // product_variant query; the fixture must answer each entity separately.
    const query = { graph: jest.fn(async ({ entity }: any) => ({
      data: entity === "product_variant"
        ? [{ id: "variant_1", title: "Standard", sku: "CAKE", product_id: "prod_1" }]
        : [{ id: "prod_1", title: "Fresh Cake", handle: "fresh-cake" }],
    })) }
    const req: any = {
      query: { limit: "20", offset: "0" },
      scope: { resolve: (key: string) => key === "query" ? query : service },
    }
    const { response, state } = responseRecorder()
    await listTemplates(req, response)

    expect(state.status).toBe(200)
    expect(state.body).toMatchObject({ count: 1, limit: 20, offset: 0 })
    expect(state.body.templates[0]).toMatchObject({
      product_title: "Fresh Cake",
      product_handle: "fresh-cake",
      variant_title: "Standard",
      assignment_scope: "VARIANT",
      field_count: 5,
      status: "ACTIVE",
      version: 2,
    })
    expect(service.listTemplateFieldCounts).toHaveBeenCalledTimes(1)
    // One batched product query plus one batched product_variant query.
    expect(query.graph).toHaveBeenCalledTimes(2)
    expect(state.body.templates[0]).not.toHaveProperty("fields")
    expect(state.body.templates[0]).not.toHaveProperty("metadata")
  })

  it("returns Store API 409 instead of selecting an ambiguous template", async () => {
    const service: any = {
      getActiveTemplate: jest.fn(async () => {
        throw new PersonalizationDomainError(
          "PERSONALIZATION_TEMPLATE_AMBIGUOUS",
          "ambiguous",
          409
        )
      }),
    }
    // The store route short-circuits unpublished products with 404 before
    // reaching getActiveTemplate, so the fixture must publish the product.
    const query = { graph: jest.fn(async () => ({ data: [{ id: "prod_1", status: "published", variants: [] }] })) }
    const req: any = {
      params: { id: "prod_1" },
      query: {},
      scope: { resolve: (key: string) => key === "query" ? query : service },
    }
    const { response, state } = responseRecorder()
    await getStoreTemplate(req, response)
    expect(state.status).toBe(409)
    expect(state.body.code).toBe("PERSONALIZATION_TEMPLATE_AMBIGUOUS")
  })

  it("migration safely disables archived legacy rows before installing active indexes", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "src", "modules", "personalization", "migrations", "Migration20260730000006.ts"),
      "utf8"
    )
    expect(migration).toContain('set "is_active" = false')
    expect(migration).toContain("UIDX_personalization_template_active_product")
    expect(migration).toContain("UIDX_personalization_template_active_variant")
    expect(migration).toContain("UIDX_personalization_template_normalized_title_scope")
    expect(migration).toContain("version_lineage_id")
    expect(migration).toContain("UIDX_personalization_template_lineage_version")
  })
})
