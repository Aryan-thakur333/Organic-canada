import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PERSONALIZATION_MODULE } from "../modules/personalization"

const SUPPORTED_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "radio",
  "checkbox",
  "boolean",
  "color",
  "image_upload",
])

const OPTION_FIELD_TYPES = new Set(["select", "radio"])
const MAX_TITLE_LENGTH = 120
const MAX_TEXT_LENGTH = 5_000

const GENERIC_TEMPLATE_TITLES = new Set([
  "personal product",
  "personal prodct",
  "personl product",
  "personalize product",
  "personalized product",
  "personalization",
  "personalization template",
  "product personalization",
  "template",
])

type LifecycleStatus = "DRAFT" | "ACTIVE" | "ARCHIVED"
type CleanupAction = "RENAME" | "EDIT_FIELDS" | "ARCHIVE" | "KEEP"

type FieldAudit = {
  fieldId: string
  key: string
  label: string
  type: string
  surcharge: number | null
  required: boolean
  sortOrder: number | null
  allowedValues: unknown
  minLength: number | null
  maxLength: number | null
  minValue: number | null
  maxValue: number | null
  createdAt: string | null
  updatedAt: string | null
  deletedAt: string | null
  valid: boolean
  validationErrors: string[]
}

const normalizeTitle = (value: unknown) => String(value || "")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("en-US")

const text = (value: unknown) => String(value ?? "")

const nullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const timestamp = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null
  const parsed = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString()
}

const lifecycleStatus = (template: any): LifecycleStatus => {
  const rawStatus = text(template?.status).trim().toUpperCase()
  if (template?.deleted_at || rawStatus === "ARCHIVED") return "ARCHIVED"
  // `is_active` is the Store API source of truth in the currently installed
  // model. Prefer it when a legacy `status` column is stale.
  if (template?.is_active) return "ACTIVE"
  return "DRAFT"
}

const assignmentKey = (template: any) => [
  text(template?.product_id),
  template?.variant_id ? `VARIANT:${template.variant_id}` : "PRODUCT",
].join("|")

const titleGroupKey = (template: any) => [
  assignmentKey(template),
  normalizeTitle(template?.title),
].join("|")

const validateFields = (fields: any[]): FieldAudit[] => {
  const normalizedKeyCounts = new Map<string, number>()
  const sortOrderCounts = new Map<number, number>()

  for (const field of fields) {
    const normalizedKey = text(field?.key).trim().toLocaleLowerCase("en-US")
    if (normalizedKey) {
      normalizedKeyCounts.set(normalizedKey, (normalizedKeyCounts.get(normalizedKey) || 0) + 1)
    }
    const sortOrder = nullableNumber(field?.sort_order)
    if (sortOrder !== null && Number.isInteger(sortOrder) && sortOrder >= 0) {
      sortOrderCounts.set(sortOrder, (sortOrderCounts.get(sortOrder) || 0) + 1)
    }
  }

  return fields.map((field) => {
    const key = text(field?.key)
    const normalizedKey = key.trim().toLocaleLowerCase("en-US")
    const label = text(field?.label)
    const type = text(field?.field_type || field?.type).trim().toLocaleLowerCase("en-US")
    const surcharge = nullableNumber(field?.price_adjustment)
    const minLength = nullableNumber(field?.min_length)
    const maxLength = nullableNumber(field?.max_length)
    const minValue = nullableNumber(field?.min_value)
    const maxValue = nullableNumber(field?.max_value)
    const sortOrder = nullableNumber(field?.sort_order)
    const errors: string[] = []

    if (!normalizedKey) errors.push("PERSONALIZATION_FIELD_KEY_REQUIRED")
    if (normalizedKey && (normalizedKeyCounts.get(normalizedKey) || 0) > 1) {
      errors.push("PERSONALIZATION_FIELD_KEY_DUPLICATE")
    }
    if (!label.trim()) errors.push("PERSONALIZATION_FIELD_LABEL_REQUIRED")
    if (!SUPPORTED_FIELD_TYPES.has(type)) errors.push("PERSONALIZATION_FIELD_TYPE_UNSUPPORTED")

    const allowedValues = field?.allowed_values ?? null
    if (OPTION_FIELD_TYPES.has(type) && (
      !Array.isArray(allowedValues)
      || allowedValues.length === 0
      || allowedValues.length > 100
      || allowedValues.some((value: unknown) => !text(value).trim())
    )) {
      errors.push("PERSONALIZATION_FIELD_OPTIONS_REQUIRED")
    }

    if (surcharge === null || !Number.isInteger(surcharge) || surcharge < 0) {
      errors.push("PERSONALIZATION_FIELD_SURCHARGE_INVALID")
    }

    if (minLength !== null && (!Number.isInteger(minLength) || minLength < 0)) {
      errors.push("PERSONALIZATION_FIELD_MIN_LENGTH_INVALID")
    }
    if (maxLength !== null && (
      !Number.isInteger(maxLength)
      || maxLength < 0
      || maxLength > MAX_TEXT_LENGTH
    )) {
      errors.push("PERSONALIZATION_FIELD_MAX_LENGTH_INVALID")
    }
    if (minLength !== null && maxLength !== null && minLength > maxLength) {
      errors.push("PERSONALIZATION_FIELD_LENGTH_RANGE_INVALID")
    }
    if (field?.min_value !== null && field?.min_value !== undefined && minValue === null) {
      errors.push("PERSONALIZATION_FIELD_MIN_VALUE_INVALID")
    }
    if (field?.max_value !== null && field?.max_value !== undefined && maxValue === null) {
      errors.push("PERSONALIZATION_FIELD_MAX_VALUE_INVALID")
    }
    if (minValue !== null && maxValue !== null && minValue > maxValue) {
      errors.push("PERSONALIZATION_FIELD_VALUE_RANGE_INVALID")
    }
    if (sortOrder === null || !Number.isInteger(sortOrder) || sortOrder < 0) {
      errors.push("PERSONALIZATION_FIELD_SORT_ORDER_INVALID")
    } else if ((sortOrderCounts.get(sortOrder) || 0) > 1) {
      errors.push("PERSONALIZATION_FIELD_SORT_ORDER_DUPLICATE")
    }

    return {
      fieldId: text(field?.id),
      key,
      label,
      type,
      surcharge,
      required: Boolean(field?.is_required),
      sortOrder,
      allowedValues,
      minLength,
      maxLength,
      minValue,
      maxValue,
      createdAt: timestamp(field?.created_at),
      updatedAt: timestamp(field?.updated_at),
      deletedAt: timestamp(field?.deleted_at),
      valid: errors.length === 0,
      validationErrors: errors,
    }
  })
}

const proposedTitle = (productTitle: string, variantTitle: string | null, scope: "PRODUCT" | "VARIANT") => {
  const product = productTitle.trim()
  if (!product) return null
  if (scope === "VARIANT" && variantTitle?.trim()) {
    return `${product} - ${variantTitle.trim()} Personalization`
  }
  return `${product} Personalization`
}

const conflictSurvivor = (templates: any[]) => [...templates].sort((left, right) => {
  if (left.fieldsValid !== right.fieldsValid) return left.fieldsValid ? -1 : 1
  if (left.version !== right.version) return Number(right.version || 0) - Number(left.version || 0)
  const updatedDifference = new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
  if (updatedDifference) return updatedDifference
  return text(left.templateId).localeCompare(text(right.templateId))
})[0]

export default async function auditPersonalizationTemplateData({ container }: ExecArgs) {
  if (process.argv.some((argument) => ["--apply", "--write", "--archive", "--fix"].includes(argument))) {
    throw new Error("PERSONALIZATION_TEMPLATE_AUDIT_IS_READ_ONLY")
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const personalizationService: any = container.resolve(PERSONALIZATION_MODULE)

  // These are deliberately bulk reads. The audit never calls a product or
  // variant lookup from inside the template loop.
  const [templates, allFields] = await Promise.all([
    personalizationService.listPersonalizationTemplates({}, {
      withDeleted: true,
      order: { created_at: "ASC" },
      take: 10_000,
      skip: 0,
    }),
    personalizationService.listPersonalizationFields({}, {
      withDeleted: true,
      order: { template_id: "ASC", sort_order: "ASC", created_at: "ASC" },
      take: 50_000,
      skip: 0,
    }),
  ])

  const templateIds = new Set((templates || []).map((template: any) => text(template.id)))
  const productIds = [...new Set((templates || []).map((template: any) => text(template.product_id)).filter(Boolean))]
  const variantIds = [...new Set((templates || []).map((template: any) => text(template.variant_id)).filter(Boolean))]

  let products: any[] = []
  if (productIds.length) {
    const result = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "status",
        "deleted_at",
        "variants.id",
        "variants.title",
        "variants.sku",
        "variants.deleted_at",
      ],
      filters: { id: productIds },
      pagination: { take: Math.max(productIds.length, 1), skip: 0 },
      withDeleted: true,
    })
    products = result.data || []
  }

  let directlyResolvedVariants: any[] = []
  if (variantIds.length) {
    const result = await query.graph({
      entity: "product_variant",
      fields: ["id", "title", "sku", "deleted_at", "product.id"],
      filters: { id: variantIds },
      pagination: { take: Math.max(variantIds.length, 1), skip: 0 },
      withDeleted: true,
    })
    directlyResolvedVariants = result.data || []
  }

  const productById = new Map(products.map((product: any) => [text(product.id), product]))
  const variantById = new Map<string, any>()
  for (const product of products) {
    for (const variant of product.variants || []) {
      variantById.set(text(variant.id), { ...variant, product: { id: product.id } })
    }
  }
  for (const variant of directlyResolvedVariants) variantById.set(text(variant.id), variant)

  const fieldsByTemplateId = new Map<string, any[]>()
  for (const field of allFields || []) {
    const templateId = text(field.template_id)
    const existing = fieldsByTemplateId.get(templateId) || []
    existing.push(field)
    fieldsByTemplateId.set(templateId, existing)
  }

  const activeAssignmentCounts = new Map<string, number>()
  const normalizedTitleCounts = new Map<string, number>()
  for (const template of templates || []) {
    if (lifecycleStatus(template) === "ACTIVE") {
      const key = assignmentKey(template)
      activeAssignmentCounts.set(key, (activeAssignmentCounts.get(key) || 0) + 1)
    }
    const normalized = normalizeTitle(template.title)
    if (normalized && lifecycleStatus(template) !== "ARCHIVED") {
      const key = titleGroupKey(template)
      normalizedTitleCounts.set(key, (normalizedTitleCounts.get(key) || 0) + 1)
    }
  }

  const auditedTemplates = (templates || []).map((template: any) => {
    const product: any = productById.get(text(template.product_id))
    const variant: any = template.variant_id ? variantById.get(text(template.variant_id)) : null
    const scope: "PRODUCT" | "VARIANT" = template.variant_id ? "VARIANT" : "PRODUCT"
    const active = lifecycleStatus(template) === "ACTIVE"
    const rawFields = (fieldsByTemplateId.get(text(template.id)) || [])
      .filter((field: any) => !field.deleted_at)
    const fields = validateFields(rawFields)
    const normalized = normalizeTitle(template.title)
    const titleErrors: string[] = []
    if (!text(template.title).trim()) titleErrors.push("PERSONALIZATION_TEMPLATE_TITLE_REQUIRED")
    if (text(template.title) !== text(template.title).trim()) titleErrors.push("PERSONALIZATION_TEMPLATE_TITLE_NOT_TRIMMED")
    if (text(template.title).trim().length > MAX_TITLE_LENGTH) titleErrors.push("PERSONALIZATION_TEMPLATE_TITLE_TOO_LONG")
    if (normalized && (normalizedTitleCounts.get(titleGroupKey(template)) || 0) > 1) {
      titleErrors.push("PERSONALIZATION_TEMPLATE_TITLE_DUPLICATE_IN_SCOPE")
    }
    if (GENERIC_TEMPLATE_TITLES.has(normalized)) titleErrors.push("PERSONALIZATION_TEMPLATE_TITLE_AMBIGUOUS")

    const variantProductId = text(variant?.product?.id || variant?.product_id)
    const relationshipErrors: string[] = []
    if (!product) relationshipErrors.push("PERSONALIZATION_PRODUCT_NOT_FOUND")
    if (template.variant_id && !variant) relationshipErrors.push("PERSONALIZATION_VARIANT_NOT_FOUND")
    if (template.variant_id && variant && variantProductId && variantProductId !== text(template.product_id)) {
      relationshipErrors.push("PERSONALIZATION_VARIANT_PRODUCT_MISMATCH")
    }
    if (!rawFields.length) relationshipErrors.push("PERSONALIZATION_TEMPLATE_NO_FIELDS")

    const duplicateAssignmentDetected = active
      && (activeAssignmentCounts.get(assignmentKey(template)) || 0) > 1
    const rawStatus = text(template.status).trim().toUpperCase() || null

    return {
      templateId: text(template.id),
      title: text(template.title),
      normalizedTitle: normalized,
      titleValid: titleErrors.length === 0,
      titleValidationErrors: titleErrors,
      status: lifecycleStatus(template),
      rawStatus,
      isActive: Boolean(template.is_active),
      version: Number(template.version || 1),
      productId: text(template.product_id),
      productTitle: text(product?.title),
      productHandle: text(product?.handle),
      productDeleted: Boolean(product?.deleted_at),
      variantId: template.variant_id ? text(template.variant_id) : null,
      variantTitle: template.variant_id ? text(variant?.title) || null : null,
      variantSku: template.variant_id ? text(variant?.sku) || null : null,
      variantDeleted: Boolean(variant?.deleted_at),
      scope,
      fieldCount: fields.length,
      fieldKeys: fields.map((field) => field.key),
      fieldLabels: fields.map((field) => field.label),
      fieldTypes: fields.map((field) => field.type),
      surchargeValues: fields.map((field) => field.surcharge),
      fields,
      fieldsValid: fields.length > 0 && fields.every((field) => field.valid),
      duplicateAssignmentDetected,
      relationshipValid: relationshipErrors.length === 0,
      relationshipErrors,
      createdAt: timestamp(template.created_at),
      updatedAt: timestamp(template.updated_at),
      publishedAt: timestamp(template.published_at),
      archived: lifecycleStatus(template) === "ARCHIVED",
      deleted: Boolean(template.deleted_at),
      deletedAt: timestamp(template.deleted_at),
    }
  })

  const conflictGroups = new Map<string, any[]>()
  for (const template of auditedTemplates.filter((candidate: any) => candidate.status === "ACTIVE")) {
    const key = `${template.productId}|${template.scope === "VARIANT" ? `VARIANT:${template.variantId}` : "PRODUCT"}`
    const existing = conflictGroups.get(key) || []
    existing.push(template)
    conflictGroups.set(key, existing)
  }
  const survivorByTemplateId = new Map<string, string>()
  for (const group of conflictGroups.values()) {
    if (group.length < 2) continue
    const survivor = conflictSurvivor(group)
    for (const template of group) survivorByTemplateId.set(template.templateId, survivor.templateId)
  }

  const cleanupProposal = auditedTemplates.map((template: any) => {
    const suggestedTitle = proposedTitle(template.productTitle, template.variantTitle, template.scope)
    const needsRename = !template.titleValid
      || GENERIC_TEMPLATE_TITLES.has(template.normalizedTitle)
    const survivorId = survivorByTemplateId.get(template.templateId)
    const reasons: string[] = []
    let recommendedAction: CleanupAction = "KEEP"

    if (template.status === "ARCHIVED") {
      reasons.push("Template is already archived; preserve it for historical references.")
    } else if (survivorId && survivorId !== template.templateId) {
      recommendedAction = "ARCHIVE"
      reasons.push(`Active assignment conflicts with ${survivorId}; archive only after an administrator reviews and approves the proposed survivor.`)
    } else if (!template.fieldsValid || !template.relationshipValid) {
      recommendedAction = "EDIT_FIELDS"
      reasons.push(...template.relationshipErrors)
      reasons.push(...template.fields.flatMap((field: FieldAudit) => field.validationErrors))
    } else if (needsRename && suggestedTitle) {
      recommendedAction = "RENAME"
      reasons.push(...template.titleValidationErrors)
      reasons.push("Use the resolved product and variant names to make the assignment unambiguous in Admin.")
    } else {
      reasons.push("No cleanup is recommended by the read-only audit.")
    }

    if (survivorId === template.templateId) {
      reasons.push("Suggested conflict survivor only; explicit administrator approval is required before archiving any competing template.")
    }

    return {
      templateId: template.templateId,
      currentTitle: template.title,
      productId: template.productId,
      productTitle: template.productTitle,
      variantId: template.variantId,
      variantTitle: template.variantTitle,
      scope: template.scope,
      recommendedTitle: suggestedTitle || template.title.trim(),
      recommendedAction,
      reason: [...new Set(reasons)].join(" "),
      incomplete: !template.fieldsValid || !template.relationshipValid,
      duplicateAssignmentDetected: template.duplicateAssignmentDetected,
      proposedConflictSurvivorId: survivorId || null,
      requiresExplicitApproval: recommendedAction === "ARCHIVE",
      applied: false,
    }
  })

  const activeTemplates = auditedTemplates.filter((template: any) => template.status === "ACTIVE")
  const duplicateAssignmentGroups = [...conflictGroups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      assignmentKey: key,
      templateIds: group.map((template: any) => template.templateId),
      proposedSurvivorId: conflictSurvivor(group).templateId,
      manualApprovalRequired: true,
    }))
  const orphanFieldIds = (allFields || [])
    .filter((field: any) => !templateIds.has(text(field.template_id)))
    .map((field: any) => text(field.id))

  const audit = {
    templateCount: auditedTemplates.length,
    activeTemplateCount: activeTemplates.length,
    templates: auditedTemplates,
    duplicateAssignmentGroupCount: duplicateAssignmentGroups.length,
    duplicateAssignmentGroups,
    orphanFieldIds,
    queryPlan: {
      templateReads: 1,
      fieldReads: 1,
      productReads: productIds.length ? 1 : 0,
      variantReads: variantIds.length ? 1 : 0,
      perTemplateProductOrVariantReads: 0,
    },
    databaseWrites: 0,
    passed: auditedTemplates.every((template: any) => (
      template.titleValid
      && template.fieldsValid
      && template.relationshipValid
      && !template.duplicateAssignmentDetected
    )) && orphanFieldIds.length === 0,
  }

  logger.info("[PERSONALIZATION_TEMPLATE_DATA_AUDIT]")
  logger.info(JSON.stringify(audit, null, 2))
  logger.info("[PERSONALIZATION_TEMPLATE_CLEANUP_DRY_RUN]")
  logger.info(JSON.stringify({
    dryRun: true,
    templateCount: auditedTemplates.length,
    recommendations: cleanupProposal,
    renameRecommendations: cleanupProposal.filter((proposal) => proposal.recommendedAction === "RENAME").length,
    incompleteTemplateCount: cleanupProposal.filter((proposal) => proposal.incomplete).length,
    archiveRecommendations: cleanupProposal.filter((proposal) => proposal.recommendedAction === "ARCHIVE").length,
    explicitApprovalRequiredForArchives: true,
    databaseWrites: 0,
  }, null, 2))

  return { audit, cleanupProposal }
}
