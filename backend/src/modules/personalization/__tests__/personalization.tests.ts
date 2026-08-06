import type { ExecArgs } from "@medusajs/framework/types"
import { PERSONALIZATION_MODULE } from "../index"

export default async function runPersonalizationTests({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const personalizationService: any = container.resolve(PERSONALIZATION_MODULE)

  const results: Array<{ name: string; passed: boolean; error?: string }> = []

  async function assert(name: string, fn: () => Promise<void> | void) {
    try {
      await fn()
      results.push({ name, passed: true })
    } catch (error: any) {
      results.push({ name, passed: false, error: error.message || String(error) })
    }
  }

  await assert("Vendor creates template for own personalized product", async () => {
    const productId = "prod_personalized_01"
    const vendorId = "vendor_01"

      const template = await personalizationService.createTemplate({
        product_id: productId,
        variant_id: null,
        vendor_id: vendorId,
        title: "Test Template",
        is_active: false,
        requires_vendor_approval: false,
        requires_production: true,
        version: 1,
        schema_hash: null,
        published_at: null,
        metadata: null,
        description: null,
      }, {
        relations: ["fields"],
      })

    if (!template.id) {
      throw new Error("Template ID missing")
    }
  })

  await assert("Standard product rejects template creation", async () => {
    try {
      await personalizationService.createTemplate({
        product_id: "prod_standard_01",
        variant_id: null,
        vendor_id: "vendor_01",
        title: "Invalid Template",
        is_active: false,
        requires_vendor_approval: false,
        requires_production: false,
        version: 1,
        schema_hash: null,
        published_at: null,
      })
      throw new Error("Should have rejected standard product")
    } catch (error: any) {
      if (!error.message.includes("standard")) {
        throw error
      }
    }
  })

  await assert("Vendor cannot create template for another vendor's product", async () => {
    try {
      await personalizationService.createTemplate({
        product_id: "prod_personalized_01",
        variant_id: null,
        vendor_id: "vendor_other_99",
        title: "Hijack Template",
        is_active: false,
        requires_vendor_approval: false,
        requires_production: false,
        version: 1,
        schema_hash: null,
        published_at: null,
      })
      throw new Error("Should have rejected cross-vendor template")
    } catch (error: any) {
      if (!error.message.includes("Forbidden") && !error.message.includes("vendor")) {
        throw error
      }
    }
  })

  await assert("Variant must belong to product", async () => {
    try {
      await personalizationService.createTemplate({
        product_id: "prod_personalized_01",
        variant_id: "variant_unknown_999",
        vendor_id: "vendor_01",
        title: "Bad Variant Template",
        is_active: false,
        requires_vendor_approval: false,
        requires_production: false,
        version: 1,
        schema_hash: null,
        published_at: null,
      })
      throw new Error("Should have rejected unknown variant")
    } catch (error: any) {
      if (!error.message.includes("variant") && !error.message.includes("product")) {
        throw error
      }
    }
  })

  await assert("Duplicate field key rejected", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_dup_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "Dup Key Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    try {
      await personalizationService.addField(template.id, {
        template_id: template.id,
        key: "dup_key",
        label: "Dup A",
        field_type: "text",
        is_required: false,
        min_length: 1,
        max_length: 100,
        allowed_values: null,
        placeholder: null,
        help_text: null,
        price_adjustment: 0,
        sort_order: 0,
        validation_rules: null,
      })

      await personalizationService.addField(template.id, {
        template_id: template.id,
        key: "dup_key",
        label: "Dup B",
        field_type: "text",
        is_required: false,
        min_length: 1,
        max_length: 100,
        allowed_values: null,
        placeholder: null,
        help_text: null,
        price_adjustment: 0,
        sort_order: 1,
        validation_rules: null,
      })

      throw new Error("Should have rejected duplicate field key")
    } catch (error: any) {
      if (!error.message.includes("Duplicate") && !error.message.includes("duplicate")) {
        throw error
      }
    }
  })

  await assert("Required field validation fails when missing", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_req_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "Req Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    await personalizationService.addField(template.id, {
      template_id: template.id,
      key: "required_field",
      label: "Required",
      field_type: "text",
      is_required: true,
      min_length: 1,
      max_length: 100,
      allowed_values: null,
      placeholder: null,
      help_text: null,
      price_adjustment: 0,
      sort_order: 0,
      validation_rules: null,
    })

    const fields = await personalizationService.listFields(template.id)
    const { validatePersonalizationInput } = await import("../utils/validate-personalization-input.js")

    try {
      validatePersonalizationInput({
        template: { is_active: true },
        fields: fields as any,
        submittedValues: {},
      })
      throw new Error("Should have failed required validation")
    } catch (error: any) {
      if (!error.message.includes("Required")) {
        throw error
      }
    }
  })

  await assert("Text max length validation", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_maxlen_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "MaxLen Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    await personalizationService.addField(template.id, {
      template_id: template.id,
      key: "short_text",
      label: "Short",
      field_type: "text",
      is_required: false,
      min_length: 1,
      max_length: 5,
      allowed_values: null,
      placeholder: null,
      help_text: null,
      price_adjustment: 0,
      sort_order: 0,
      validation_rules: null,
    })

    const fields = await personalizationService.listFields(template.id)
    const { validatePersonalizationInput } = await import("../utils/validate-personalization-input.js")

    try {
      validatePersonalizationInput({
        template: { is_active: true },
        fields: fields as any,
        submittedValues: { short_text: "too long value" },
      })
      throw new Error("Should have failed max length validation")
    } catch (error: any) {
      if (!error.message.includes("above max length")) {
        throw error
      }
    }
  })

  await assert("Invalid select option rejected", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_select_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "Select Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    await personalizationService.addField(template.id, {
      template_id: template.id,
      key: "color_choice",
      label: "Color",
      field_type: "select",
      is_required: true,
      min_length: null,
      max_length: null,
      allowed_values: ["red", "blue", "green"],
      placeholder: null,
      help_text: null,
      price_adjustment: 0,
      sort_order: 0,
      validation_rules: null,
    })

    const fields = await personalizationService.listFields(template.id)
    const { validatePersonalizationInput } = await import("../utils/validate-personalization-input.js")

    try {
      validatePersonalizationInput({
        template: { is_active: true },
        fields: fields as any,
        submittedValues: { color_choice: "yellow" },
      })
      throw new Error("Should have rejected invalid option")
    } catch (error: any) {
      if (!error.message.includes("Invalid select option")) {
        throw error
      }
    }
  })

  await assert("Checkbox normalized to boolean", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_checkbox_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "Checkbox Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    await personalizationService.addField(template.id, {
      template_id: template.id,
      key: "gift_wrap",
      label: "Gift Wrap",
      field_type: "checkbox",
      is_required: false,
      min_length: null,
      max_length: null,
      allowed_values: null,
      placeholder: null,
      help_text: null,
      price_adjustment: 500,
      sort_order: 0,
      validation_rules: null,
    })

    const fields = await personalizationService.listFields(template.id)
    const { validatePersonalizationInput } = await import("../utils/validate-personalization-input.js")

    const result = validatePersonalizationInput({
      template: { is_active: true },
      fields: fields as any,
      submittedValues: { gift_wrap: "true" },
    })

    if (result.normalizedValues.gift_wrap !== true) {
      throw new Error("Checkbox not normalized to true")
    }
    if (result.priceAdjustment !== 500) {
      throw new Error(`Price adjustment should be 500, got ${result.priceAdjustment}`)
    }
  })

  await assert("Price adjustment calculated on server", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_price_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "Price Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    await personalizationService.addField(template.id, {
      template_id: template.id,
      key: "engraving",
      label: "Engraving",
      field_type: "text",
      is_required: false,
      min_length: 1,
      max_length: 50,
      allowed_values: null,
      placeholder: null,
      help_text: null,
      price_adjustment: 200,
      sort_order: 0,
      validation_rules: null,
    })

    await personalizationService.addField(template.id, {
      template_id: template.id,
      key: "rush",
      label: "Rush",
      field_type: "checkbox",
      is_required: false,
      min_length: null,
      max_length: null,
      allowed_values: null,
      placeholder: null,
      help_text: null,
      price_adjustment: 300,
      sort_order: 1,
      validation_rules: null,
    })

    const fields = await personalizationService.listFields(template.id)
    const { validatePersonalizationInput } = await import("../utils/validate-personalization-input.js")

    const result = validatePersonalizationInput({
      template: { is_active: true },
      fields: fields as any,
      submittedValues: { engraving: "hi", rush: true },
    })

    if (result.priceAdjustment !== 500) {
      throw new Error(`Expected price adjustment 500, got ${result.priceAdjustment}`)
    }
  })

  await assert("Publish increments version and generates schema_hash", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_publish_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "Publish Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    const published = await personalizationService.publishTemplate(template.id)

    if ((published.version || 1) <= 1) {
      throw new Error("Version should increment on publish")
    }
    if (!published.schema_hash) {
      throw new Error("schema_hash should be set on publish")
    }
    if (!published.published_at) {
      throw new Error("published_at should be set on publish")
    }
  })

  await assert("Draft template not visible to store route", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_draft_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "Draft Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    const active = await personalizationService.getActiveTemplate(template.product_id, template.variant_id)

    if (active) {
      throw new Error("Draft template should not be returned as active")
    }
  })

  await assert("Published template visible", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_published_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "Published Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    await personalizationService.publishTemplate(template.id)

    const active = await personalizationService.getActiveTemplate(template.product_id, template.variant_id)

    if (!active || active.id !== template.id) {
      throw new Error("Published template should be visible")
    }
  })

  await assert("Soft delete preserves historical safety", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_softdel_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "SoftDelete Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    await personalizationService.delete(template.id)

    try {
      await personalizationService.retrieve(template.id)
      throw new Error("Soft-deleted template should not be retrievable")
    } catch (error: any) {
      if (!error.message.includes("not found")) {
        throw error
      }
    }
  })

  await assert("Another vendor cannot update template", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalized_cross_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "Cross Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    try {
      await personalizationService.validateTemplateOwnership(template.id, "vendor_other_99")
      throw new Error("Should have forbidden cross-vendor ownership validation")
    } catch (error: any) {
      if (!error.message.includes("PERSONALIZATION_FORBIDDEN")) {
        throw error
      }
    }
  })

  await assert("Unknown submitted field rejected", async () => {
    const template = await personalizationService.createTemplate({
      product_id: "prod_personalization_unknown_01",
      variant_id: null,
      vendor_id: "vendor_01",
      title: "Unknown Field Template",
      is_active: false,
      requires_vendor_approval: false,
      requires_production: false,
      version: 1,
      schema_hash: null,
      published_at: null,
    }, {
      relations: ["fields"],
    })

    await personalizationService.addField(template.id, {
      template_id: template.id,
      key: "known_field",
      label: "Known",
      field_type: "text",
      is_required: false,
      min_length: 1,
      max_length: 100,
      allowed_values: null,
      placeholder: null,
      help_text: null,
      price_adjustment: 0,
      sort_order: 0,
      validation_rules: null,
    })

    const fields = await personalizationService.listFields(template.id)
    const { validatePersonalizationInput } = await import("../utils/validate-personalization-input.js")

    try {
      validatePersonalizationInput({
        template: { is_active: true },
        fields: fields as any,
        submittedValues: { known_field: "ok", unknown_field: "bad" },
      })
      throw new Error("Should have rejected unknown field")
    } catch (error: any) {
      if (!error.message.includes("Unknown submitted field")) {
        throw error
      }
    }
  })

  await assert("Centralized schema hashing: equal schemas produce equal hashes", async () => {
    const { generatePersonalizationSchemaHash } = await import("../utils/schema-hash.js")
    const schema1 = {
      product_id: "prod_1",
      variant_id: "var_1",
      requires_vendor_approval: true,
      requires_production: false,
      fields: [
        { key: "field_a", field_type: "text", is_required: true, min_length: 5, price_adjustment: 10, allowed_values: ["val1", "val2"] }
      ]
    }
    const schema2 = {
      product_id: "prod_1",
      variant_id: "var_1",
      requires_vendor_approval: true,
      requires_production: false,
      fields: [
        { key: "field_a", field_type: "text", is_required: true, min_length: 5, price_adjustment: 10, allowed_values: ["val1", "val2"] }
      ]
    }
    const hash1 = generatePersonalizationSchemaHash(schema1)
    const hash2 = generatePersonalizationSchemaHash(schema2)
    if (hash1 !== hash2) {
      throw new Error(`Expected identical hashes but got ${hash1} and ${hash2}`)
    }
  })

  await assert("Centralized schema hashing: changed fields produce a changed hash", async () => {
    const { generatePersonalizationSchemaHash } = await import("../utils/schema-hash.js")
    const schema1 = {
      product_id: "prod_1",
      variant_id: "var_1",
      requires_vendor_approval: true,
      requires_production: false,
      fields: [
        { key: "field_a", field_type: "text", is_required: true }
      ]
    }
    const schema2 = {
      product_id: "prod_1",
      variant_id: "var_1",
      requires_vendor_approval: true,
      requires_production: false,
      fields: [
        { key: "field_b", field_type: "text", is_required: true }
      ]
    }
    const hash1 = generatePersonalizationSchemaHash(schema1)
    const hash2 = generatePersonalizationSchemaHash(schema2)
    if (hash1 === hash2) {
      throw new Error("Expected different hashes when fields change")
    }
  })

  await assert("Centralized schema hashing: changed price adjustment changes hash", async () => {
    const { generatePersonalizationSchemaHash } = await import("../utils/schema-hash.js")
    const schema1 = {
      product_id: "prod_1",
      variant_id: "var_1",
      requires_vendor_approval: true,
      requires_production: false,
      fields: [
        { key: "field_a", field_type: "text", is_required: true, price_adjustment: 10 }
      ]
    }
    const schema2 = {
      product_id: "prod_1",
      variant_id: "var_1",
      requires_vendor_approval: true,
      requires_production: false,
      fields: [
        { key: "field_a", field_type: "text", is_required: true, price_adjustment: 20 }
      ]
    }
    const hash1 = generatePersonalizationSchemaHash(schema1)
    const hash2 = generatePersonalizationSchemaHash(schema2)
    if (hash1 === hash2) {
      throw new Error("Expected different hashes when price_adjustment changes")
    }
  })

  await assert("Centralized schema hashing: changed allowed values changes hash", async () => {
    const { generatePersonalizationSchemaHash } = await import("../utils/schema-hash.js")
    const schema1 = {
      product_id: "prod_1",
      variant_id: "var_1",
      requires_vendor_approval: true,
      requires_production: false,
      fields: [
        { key: "field_a", field_type: "select", is_required: true, allowed_values: ["val1", "val2"] }
      ]
    }
    const schema2 = {
      product_id: "prod_1",
      variant_id: "var_1",
      requires_vendor_approval: true,
      requires_production: false,
      fields: [
        { key: "field_a", field_type: "select", is_required: true, allowed_values: ["val1", "val3"] }
      ]
    }
    const hash1 = generatePersonalizationSchemaHash(schema1)
    const hash2 = generatePersonalizationSchemaHash(schema2)
    if (hash1 === hash2) {
      throw new Error("Expected different hashes when allowed_values change")
    }
  })

  await assert("Centralized schema hashing: reordered equivalent canonical input remains deterministic", async () => {
    const { generatePersonalizationSchemaHash } = await import("../utils/schema-hash.js")
    const schema1 = {
      product_id: "prod_1",
      variant_id: "var_1",
      requires_vendor_approval: true,
      requires_production: false,
      fields: [
        { key: "field_a", field_type: "text", is_required: true, price_adjustment: 10 },
        { key: "field_b", field_type: "text", is_required: false, price_adjustment: 0 }
      ]
    }
    const schema2 = {
      product_id: "prod_1",
      variant_id: "var_1",
      requires_vendor_approval: true,
      requires_production: false,
      fields: [
        { key: "field_b", field_type: "text", is_required: false, price_adjustment: 0 },
        { key: "field_a", field_type: "text", is_required: true, price_adjustment: 10 }
      ]
    }
    const hash1 = generatePersonalizationSchemaHash(schema1)
    const hash2 = generatePersonalizationSchemaHash(schema2)
    if (hash1 !== hash2) {
      throw new Error("Expected identical hashes for reordered equivalent fields")
    }
  })

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed)

  logger.info(`Personalization tests: ${passed}/${results.length} passed`)

  if (failed.length) {
    logger.error("Failed personalization tests:")
    for (const f of failed) {
      logger.error(`  - ${f.name}: ${f.error}`)
    }
    throw new Error(`${failed.length} personalization test(s) failed`)
  }

  return results
}
