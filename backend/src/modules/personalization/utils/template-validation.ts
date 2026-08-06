import { personalizationError } from "../errors"
import { validateFieldConfiguration } from "./field-configuration"

export const PERSONALIZATION_TEMPLATE_TITLE_MAX_LENGTH = 120
export const PERSONALIZATION_TEMPLATE_DESCRIPTION_MAX_LENGTH = 2_000
export const PERSONALIZATION_TEMPLATE_MAX_FIELDS = 25

export const PERSONALIZATION_TEMPLATE_STATUSES = [
  "draft",
  "active",
  "archived",
] as const

export type PersonalizationTemplateStatus =
  (typeof PERSONALIZATION_TEMPLATE_STATUSES)[number]

export function normalizeTemplateTitle(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
}

export function normalizedTemplateTitleKey(value: unknown): string {
  return normalizeTemplateTitle(value).toLocaleLowerCase("en")
}

export function validateTemplateTitle(value: unknown): string {
  const title = normalizeTemplateTitle(value)
  if (!title) {
    personalizationError(
      "PERSONALIZATION_TEMPLATE_TITLE_REQUIRED",
      "Personalization template title is required."
    )
  }
  if (title.length > PERSONALIZATION_TEMPLATE_TITLE_MAX_LENGTH) {
    personalizationError(
      "PERSONALIZATION_TEMPLATE_TITLE_TOO_LONG",
      `Personalization template title must be ${PERSONALIZATION_TEMPLATE_TITLE_MAX_LENGTH} characters or fewer.`
    )
  }
  return title
}

export function validateTemplateDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const description = String(value).trim()
  if (description.length > PERSONALIZATION_TEMPLATE_DESCRIPTION_MAX_LENGTH) {
    personalizationError(
      "PERSONALIZATION_TEMPLATE_DESCRIPTION_TOO_LONG",
      `Personalization template description must be ${PERSONALIZATION_TEMPLATE_DESCRIPTION_MAX_LENGTH} characters or fewer.`
    )
  }
  return description || null
}

export function getTemplateLifecycleStatus(template: any): PersonalizationTemplateStatus {
  const status = String(template?.status || "").toLowerCase()
  const metadataStatus = String(template?.metadata?.lifecycle_status || "").toLowerCase()

  if (status === "archived" || metadataStatus === "archived") return "archived"
  if (template?.is_active === true || status === "active" || metadataStatus === "active") {
    return "active"
  }
  return "draft"
}

export function lifecycleMetadata(
  metadata: Record<string, unknown> | null | undefined,
  status: PersonalizationTemplateStatus
) {
  return { ...(metadata || {}), lifecycle_status: status }
}

export function validateTemplateFields(fields: any[], options: { requireFields?: boolean } = {}) {
  const requireFields = options.requireFields !== false
  if (!Array.isArray(fields)) {
    personalizationError(
      "PERSONALIZATION_TEMPLATE_FIELDS_INVALID",
      "Personalization template fields must be an array."
    )
  }
  if (requireFields && fields.length === 0) {
    personalizationError(
      "PERSONALIZATION_TEMPLATE_FIELDS_REQUIRED",
      "An active personalization template requires at least one field."
    )
  }
  if (fields.length > PERSONALIZATION_TEMPLATE_MAX_FIELDS) {
    personalizationError(
      "PERSONALIZATION_TEMPLATE_TOO_MANY_FIELDS",
      `A personalization template may contain at most ${PERSONALIZATION_TEMPLATE_MAX_FIELDS} fields.`
    )
  }

  const keys = new Set<string>()
  return fields.map((field, index) => {
    const validated = validateFieldConfiguration({
      ...field,
      sort_order: field?.sort_order ?? index,
    })
    if (keys.has(validated.key)) {
      personalizationError(
        "PERSONALIZATION_FIELD_KEY_DUPLICATE",
        "Field keys must be unique within a template.",
        409,
        { key: validated.key }
      )
    }
    keys.add(validated.key)
    return validated
  })
}

export function requireSuppliedFieldKeys(fields: any[]) {
  for (const field of fields || []) {
    if (!String(field?.key ?? "").trim()) {
      personalizationError(
        "PERSONALIZATION_FIELD_KEY_REQUIRED",
        "Personalization field key is required."
      )
    }
  }
  return fields
}

export function validateTemplateDefinition(input: {
  title: unknown
  description?: unknown
  fields: any[]
  requireFields?: boolean
  allow_normal_purchase?: boolean
  personalization_required?: boolean
}) {
  const title = validateTemplateTitle(input.title)
  const description = validateTemplateDescription(input.description)
  const fields = validateTemplateFields(input.fields, {
    requireFields: input.requireFields,
  })

  const allowNormal = input.allow_normal_purchase !== false
  const reqPersonalization = Boolean(input.personalization_required)

  if (reqPersonalization) {
    if (allowNormal) {
      personalizationError(
        "PERSONALIZATION_REQUIRED_CONFLICT",
        "Personalization cannot be required when normal purchase is allowed."
      )
    }
    const hasRequiredField = fields.some((f) => Boolean(f.is_required))
    if (!hasRequiredField) {
      personalizationError(
        "PERSONALIZATION_REQUIRED_FIELD_MISSING",
        "Required personalization must contain at least one required field."
      )
    }
  }

  return {
    title,
    description,
    fields,
  }
}
