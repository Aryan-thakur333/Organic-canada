import { MedusaService } from "@medusajs/framework/utils"
import { PersonalizationTemplate } from "./models/personalization-template"
import { PersonalizationField } from "./models/personalization-field"
import { CartItemPersonalization } from "./models/cart-item-personalization"
import { OrderItemPersonalization } from "./models/order-item-personalization"
import { PersonalizationAsset } from "./models/personalization-asset"
import { generatePersonalizationSchemaHash } from "./utils/schema-hash"
import { personalizationError } from "./errors"
import {
  getTemplateLifecycleStatus,
  lifecycleMetadata,
  normalizedTemplateTitleKey,
  validateTemplateDefinition,
  validateTemplateTitle,
} from "./utils/template-validation"

function sameAssignment(left: any, productId: string, variantId: string | null) {
  return (
    String(left?.product_id || "") === productId &&
    (left?.variant_id ? String(left.variant_id) : null) === variantId
  )
}

function templateLineageId(template: any) {
  return String(
    template?.version_lineage_id ||
    template?.metadata?.version_lineage_id ||
    template?.id ||
    ""
  )
}

function eligibleActiveTemplates(templates: any[]) {
  return (templates || []).filter(
    (template) =>
      template?.is_active === true &&
      getTemplateLifecycleStatus(template) !== "archived" &&
      !template?.deleted_at
  )
}

function selectUnambiguousActiveTemplate(templates: any[], scope: "product" | "variant") {
  const active = eligibleActiveTemplates(templates)
  if (active.length > 1) {
    personalizationError(
      "PERSONALIZATION_TEMPLATE_AMBIGUOUS",
      `Multiple active ${scope}-level personalization templates were found.`,
      409,
      { scope }
    )
  }
  return active[0] || null
}

export default class PersonalizationService extends MedusaService({
  PersonalizationTemplate,
  PersonalizationField,
  CartItemPersonalization,
  OrderItemPersonalization,
  PersonalizationAsset,
}) {
  // Legacy aliases for test backward-compatibility
  async retrieve(templateId: string, config?: any) {
    return this.retrievePersonalizationTemplate(templateId, config)
  }

  async delete(templateId: string) {
    return this.deletePersonalizationTemplates(templateId)
  }

  async getTemplate(templateId: string, config?: any) {
    return this.retrievePersonalizationTemplate(templateId, config)
  }

  async listTemplates(filters?: any, config?: any) {
    return this.listPersonalizationTemplates(filters, config)
  }

  async updateTemplate(templateId: string, data: any) {
    const updated = await this.updatePersonalizationTemplates({
      id: templateId,
      ...data,
    })
    return updated
  }

  async deleteTemplate(templateId: string) {
    return this.deletePersonalizationTemplates(templateId)
  }

  async createTemplate(data: any, options?: any) {
    return this.createPersonalizationTemplates(data)
  }

  async addField(templateId: string, data: any) {
    return this.createPersonalizationFields({
      template_id: templateId,
      ...data,
    })
  }

  async updateField(fieldId: string, data: any) {
    const updated = await this.updatePersonalizationFields({
      id: fieldId,
      ...data,
    })
    return updated
  }

  async deleteField(fieldId: string) {
    return this.deletePersonalizationFields(fieldId)
  }

  async listFields(templateId: string) {
    return this.listPersonalizationFields(
      { template_id: templateId },
      { order: { sort_order: "ASC" } }
    )
  }

  /**
   * Fields use an explicit template_id column for compatibility with the
   * existing personalization schema, rather than a DML relation property.
   * Hydrate them deliberately so API callers never pass the unsupported
   * `relations: ["fields"]` option to Medusa's generated repository.
   */
  async getTemplateWithFields(templateId: string) {
    const template = await this.retrievePersonalizationTemplate(templateId)
    const fields = await this.listFields(templateId)
    return { ...(template as any), fields }
  }

  async listTemplatesWithFields(filters?: any, config: any = {}) {
    const { relations: _relations, ...safeConfig } = config || {}
    const templates = await this.listPersonalizationTemplates(filters || {}, safeConfig)
    const templateIds = (templates || []).map((template: any) => template.id)
    if (!templateIds.length) return []
    const fields = await this.listPersonalizationFields(
      { template_id: templateIds } as any,
      { take: Math.max(templateIds.length * 25, 25) } as any
    )
    const fieldsByTemplate = new Map<string, any[]>()
    for (const field of fields || []) {
      const templateId = String((field as any).template_id)
      fieldsByTemplate.set(templateId, [...(fieldsByTemplate.get(templateId) || []), field])
    }
    for (const grouped of fieldsByTemplate.values()) {
      grouped.sort((left: any, right: any) =>
        Number(left.sort_order || 0) - Number(right.sort_order || 0)
      )
    }
    return (templates || []).map((template: any) => ({
      ...template,
      fields: fieldsByTemplate.get(template.id) || [],
    }))
  }

  async listTemplateFieldCounts(templateIds: string[]) {
    const ids = Array.from(new Set((templateIds || []).filter(Boolean)))
    if (!ids.length) return new Map<string, number>()
    const fields = await this.listPersonalizationFields(
      { template_id: ids } as any,
      { select: ["id", "template_id"], take: Math.max(ids.length * 25, 25) } as any
    )
    const counts = new Map<string, number>()
    for (const field of fields || []) {
      const templateId = String((field as any).template_id || "")
      if (templateId) counts.set(templateId, (counts.get(templateId) || 0) + 1)
    }
    return counts
  }

  async assertUniqueTemplateTitle(input: {
    productId: string
    variantId?: string | null
    title: unknown
    excludeTemplateId?: string
    versionLineageId?: string
  }) {
    const productId = String(input.productId || "").trim()
    const variantId = input.variantId ? String(input.variantId) : null
    const title = validateTemplateTitle(input.title)
    const normalizedTitle = normalizedTemplateTitleKey(title)
    const candidates = await this.listPersonalizationTemplates(
      { product_id: productId, deleted_at: null } as any,
      { take: 500 } as any
    )
    const duplicate = (candidates || []).find((candidate: any) =>
      candidate.id !== input.excludeTemplateId &&
      (!input.versionLineageId || templateLineageId(candidate) !== input.versionLineageId) &&
      getTemplateLifecycleStatus(candidate) !== "archived" &&
      sameAssignment(candidate, productId, variantId) &&
      normalizedTemplateTitleKey(candidate.title) === normalizedTitle
    )
    if (duplicate) {
      personalizationError(
        "PERSONALIZATION_TEMPLATE_TITLE_DUPLICATE",
        "A template with the same title already exists for this product and assignment scope. Use a distinct, descriptive title.",
        409,
        { conflicting_template_id: duplicate.id }
      )
    }
    return title
  }

  async getNextTemplateVersion(template: any) {
    const lineageId = templateLineageId(template)
    const candidates = await this.listPersonalizationTemplates(
      { version_lineage_id: lineageId, deleted_at: null } as any,
      { take: 500 } as any
    )
    const versions = (candidates || [])
      .filter((candidate: any) => templateLineageId(candidate) === lineageId)
      .map((candidate: any) => Math.max(1, Number(candidate.version) || 1))
    return Math.max(Math.max(1, Number(template.version) || 1), ...versions) + 1
  }

  async assertActiveAssignmentAvailable(input: {
    productId: string
    variantId?: string | null
    excludeTemplateId?: string
  }) {
    const conflicts = await this.listActiveAssignmentConflicts(input)
    if (conflicts.length) {
      const variantScope = Boolean(input.variantId)
      personalizationError(
        variantScope
          ? "PERSONALIZATION_VARIANT_TEMPLATE_ALREADY_ACTIVE"
          : "PERSONALIZATION_PRODUCT_TEMPLATE_ALREADY_ACTIVE",
        variantScope
          ? "This product variant already has an active personalization template."
          : "This product already has an active all-variants personalization template.",
        409,
        { conflicting_template_ids: conflicts.map((item: any) => item.id) }
      )
    }
  }

  async listActiveAssignmentConflicts(input: {
    productId: string
    variantId?: string | null
    excludeTemplateId?: string
  }) {
    const productId = String(input.productId || "").trim()
    const variantId = input.variantId ? String(input.variantId) : null
    const candidates = await this.listPersonalizationTemplates(
      {
        product_id: productId,
        variant_id: variantId,
        is_active: true,
        deleted_at: null,
      } as any,
      { take: 3 } as any
    )
    const conflicts = eligibleActiveTemplates(candidates as any[]).filter(
      (candidate: any) => candidate.id !== input.excludeTemplateId
    )
    return conflicts
  }

  async getActiveTemplate(productId: string, variantId?: string | null) {
    const baseWhere: any = {
      product_id: productId,
      is_active: true,
      deleted_at: null,
    }
    if (variantId) {
      const variantTemplates = await this.listPersonalizationTemplates({ ...baseWhere, variant_id: variantId } as any, {
        order: { created_at: "DESC" },
        take: 3,
      })
      const exact = selectUnambiguousActiveTemplate(variantTemplates as any[], "variant")
      if (exact) return this.getTemplateWithFields((exact as any).id)
    }

    const templates = await this.listPersonalizationTemplates({ ...baseWhere, variant_id: null } as any, {
      order: { created_at: "DESC" },
      take: 3,
    })
    const fallback = selectUnambiguousActiveTemplate(templates as any[], "product")
    return fallback ? this.getTemplateWithFields((fallback as any).id) : null
  }

  validateActiveTemplateSchema(template: any) {
    if (!template || template.is_active !== true || getTemplateLifecycleStatus(template) === "archived") {
      personalizationError(
        "PERSONALIZATION_NOT_AVAILABLE",
        "No active personalization template is available.",
        404
      )
    }
    return validateTemplateDefinition({
      title: template.title,
      description: template.description,
      fields: template.fields || [],
      requireFields: true,
    })
  }

  async validateTemplateOwnership(templateId: string, vendorId: string) {
    const template = await this.retrievePersonalizationTemplate(templateId)
    if ((template as any).vendor_id !== vendorId) {
      throw new Error("PERSONALIZATION_FORBIDDEN")
    }
    return template
  }

  async publishTemplate(
    templateId: string,
    options: { incrementVersion?: boolean; preserveVersion?: boolean } = {}
  ) {
    const template = await this.getTemplateWithFields(templateId)
    if (getTemplateLifecycleStatus(template) === "archived") {
      personalizationError(
        "PERSONALIZATION_TEMPLATE_ARCHIVED",
        "Archived personalization templates are immutable. Duplicate this template to create a new draft.",
        409
      )
    }

    const definition = validateTemplateDefinition({
      title: (template as any).title,
      description: (template as any).description,
      fields: (template as any).fields || [],
      requireFields: true,
      allow_normal_purchase: (template as any).metadata?.allow_normal_purchase !== false,
      personalization_required: Boolean((template as any).metadata?.personalization_required),
    })
    const fields = definition.fields

    const assignmentConflicts = await this.listActiveAssignmentConflicts({
      productId: String((template as any).product_id),
      variantId: (template as any).variant_id,
      excludeTemplateId: templateId,
    })
    const lineageId = templateLineageId(template)
    const isVersionChild = Boolean(
      (template as any).version_lineage_id ||
      (template as any).metadata?.version_lineage_id
    )
    const lineageParents = isVersionChild
      ? assignmentConflicts.filter((candidate: any) => templateLineageId(candidate) === lineageId)
      : []
    const unrelatedConflicts = assignmentConflicts.filter(
      (candidate: any) => !lineageParents.some((parent: any) => parent.id === candidate.id)
    )
    if (lineageParents.length > 1) {
      personalizationError(
        "PERSONALIZATION_TEMPLATE_AMBIGUOUS",
        "Multiple active versions exist in this personalization template lineage.",
        409,
        { template_ids: lineageParents.map((item: any) => item.id) }
      )
    }
    if (unrelatedConflicts.length) {
      const variantScope = Boolean((template as any).variant_id)
      personalizationError(
        variantScope
          ? "PERSONALIZATION_VARIANT_TEMPLATE_ALREADY_ACTIVE"
          : "PERSONALIZATION_PRODUCT_TEMPLATE_ALREADY_ACTIVE",
        variantScope
          ? "This product variant already has an active personalization template."
          : "This product already has an active all-variants personalization template.",
        409,
        { conflicting_template_ids: unrelatedConflicts.map((item: any) => item.id) }
      )
    }
    await this.assertUniqueTemplateTitle({
      productId: String((template as any).product_id),
      variantId: (template as any).variant_id,
      title: definition.title,
      excludeTemplateId: templateId,
      versionLineageId: templateLineageId(template),
    })

    const currentHash = generatePersonalizationSchemaHash({
      product_id: (template as any).product_id,
      variant_id: (template as any).variant_id,
      requires_vendor_approval: (template as any).requires_vendor_approval,
      requires_production: (template as any).requires_production,
      fields: fields.map((f: any) => ({
        key: f.key,
        field_type: f.field_type,
        is_required: f.is_required,
        min_length: f.min_length,
        max_length: f.max_length,
        min_value: f.min_value,
        max_value: f.max_value,
        allowed_values: f.allowed_values,
        price_adjustment: f.price_adjustment,
        sort_order: f.sort_order,
        validation_rules: f.validation_rules,
      })),
    })

    let version = Math.max(1, Number((template as any).version) || 1)
    if ((template as any).published_at && !options.preserveVersion) {
      if (options.incrementVersion || (template as any).schema_hash !== currentHash) {
        version = version + 1
      }
    }

    const lineageParent = lineageParents[0]
    if (lineageParent) {
      await this.updatePersonalizationTemplates({
        id: lineageParent.id,
        status: "archived",
        is_active: false,
        metadata: {
          ...lifecycleMetadata(lineageParent.metadata, "archived"),
          archived_at: new Date().toISOString(),
          superseded_by_template_id: templateId,
        },
      } as any)
    }

    try {
      await this.updatePersonalizationTemplates({
        id: templateId,
        title: definition.title,
        version,
        schema_hash: currentHash,
        published_at: new Date(),
        status: "active",
        is_active: true,
        metadata: lifecycleMetadata((template as any).metadata, "active"),
      } as any)
    } catch (error) {
      if (lineageParent) {
        try {
          await this.updatePersonalizationTemplates({
            id: lineageParent.id,
            status: "active",
            is_active: true,
            metadata: lifecycleMetadata(lineageParent.metadata, "active"),
          } as any)
        } catch {
          // Preserve the activation failure; the reconciliation audit can flag a
          // failed compensation without hiding the original database error.
        }
      }
      throw error
    }

    return this.getTemplateWithFields(templateId)
  }

  async deactivateTemplate(templateId: string) {
    const template = await this.retrievePersonalizationTemplate(templateId)
    if (getTemplateLifecycleStatus(template) === "archived") {
      personalizationError(
        "PERSONALIZATION_TEMPLATE_ARCHIVED",
        "Archived personalization templates cannot be returned to draft.",
        409
      )
    }
    await this.updatePersonalizationTemplates({
      id: templateId,
      status: "draft",
      is_active: false,
      metadata: lifecycleMetadata((template as any).metadata, "draft"),
    } as any)
    return this.getTemplateWithFields(templateId)
  }

  async archiveTemplate(templateId: string) {
    const template = await this.retrievePersonalizationTemplate(templateId)
    await this.updatePersonalizationTemplates({
      id: templateId,
      status: "archived",
      is_active: false,
      metadata: {
        ...lifecycleMetadata((template as any).metadata, "archived"),
        archived_at: new Date().toISOString(),
      },
    } as any)
    return this.getTemplateWithFields(templateId)
  }

  async rollbackDraftTemplateCreation(templateId: string, fieldIds: string[] = []) {
    for (const fieldId of [...fieldIds].reverse()) {
      try {
        await this.deletePersonalizationFields(fieldId)
      } catch {
        // Continue best-effort compensation so the template row is still removed.
      }
    }
    try {
      await this.deletePersonalizationTemplates(templateId)
    } catch {
      // The original persistence error remains the actionable failure.
    }
  }

  async createCartItemPersonalization(data: any) {
    return this.createCartItemPersonalizations(data)
  }

  async createOrderItemPersonalization(data: any) {
    return this.createOrderItemPersonalizations(data)
  }
}
