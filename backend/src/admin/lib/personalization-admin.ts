export const PERSONALIZATION_PAGE_SIZE = 10
export const PERSONALIZATION_TITLE_MAX_LENGTH = 120

/**
 * Canonical purchase-mode enum. The UI toggles `allow_normal_purchase` and
 * `personalization_required` are derived from this single source of truth so
 * the invalid `true + true` state can never be submitted.
 *
 * OPTIONAL_PERSONALIZATION  → allow_normal_purchase = true,  personalization_required = false
 * REQUIRED_PERSONALIZATION  → allow_normal_purchase = false, personalization_required = true
 */
export const PURCHASE_MODES = ["OPTIONAL_PERSONALIZATION", "REQUIRED_PERSONALIZATION"] as const
export type PurchaseMode = (typeof PURCHASE_MODES)[number]

export type PersonalizationLifecycle = "draft" | "active" | "archived"

export type PersonalizationProduct = {
  id: string
  title?: string | null
  handle?: string | null
  variants?: PersonalizationVariant[]
}

export type PersonalizationVariant = {
  id: string
  title?: string | null
  sku?: string | null
}

export type PersonalizationField = {
  id?: string
  key?: string
  label?: string
  field_type?: string
  is_required?: boolean
  help_text?: string | null
  placeholder?: string | null
  min_length?: number | null
  max_length?: number | null
  min_value?: number | null
  max_value?: number | null
  allowed_values?: string[] | string | null
  validation_rules?: Record<string, unknown> | null
  price_adjustment?: number | string | null
  sort_order?: number | string | null
}

export type PersonalizationTemplate = {
  id: string
  title: string
  description?: string | null
  product_id: string
  product_title?: string | null
  product_handle?: string | null
  product?: PersonalizationProduct | null
  variant_id?: string | null
  variant_title?: string | null
  variant?: PersonalizationVariant | null
  assignment_scope?: "PRODUCT" | "VARIANT" | string | null
  fields?: PersonalizationField[]
  field_count?: number | null
  fields_valid?: boolean | null
  is_active?: boolean
  lifecycle_status?: string | null
  status?: string | null
  version?: number | null
  created_at?: string | null
  updated_at?: string | null
  published_at?: string | null
  deleted_at?: string | null
  archived_at?: string | null
  metadata?: Record<string, any> | null
}

export type PersonalizationFieldDraft = {
  key: string
  label: string
  field_type: string
  is_required: boolean
  help_text: string
  placeholder: string
  min_length: string
  max_length: string
  min_value: string
  max_value: string
  allowed_values: string
  price_adjustment: string
  sort_order: number
}

export type TemplateDraft = {
  title: string
  description: string
  product_id: string
  variant_id: string
  allow_normal_purchase: boolean
  personalization_required: boolean
  fields: PersonalizationFieldDraft[]
}

export type TemplateValidationIssue = {
  code: string
  message: string
  fieldIndex?: number
}

const supportedFieldTypes = new Set([
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

export const PERSONALIZATION_FIELD_TYPES = [...supportedFieldTypes]

/**
 * Derive the canonical purchase mode from legacy boolean flags.
 * Falls back to OPTIONAL when the flags are inconsistent (never REQUIRED
 * unless explicitly requested), so the UI can self-heal.
 */
export function purchaseModeFromDraft(draft: Pick<TemplateDraft, "allow_normal_purchase" | "personalization_required">): PurchaseMode {
  if (draft.personalization_required === true) return "REQUIRED_PERSONALIZATION"
  return "OPTIONAL_PERSONALIZATION"
}

/**
 * Convert a canonical purchase mode back to the legacy boolean pair.
 * This is the single source of truth that guarantees `true + true` is impossible.
 */
export function draftFromPurchaseMode(mode: PurchaseMode): { allow_normal_purchase: boolean; personalization_required: boolean } {
  if (mode === "REQUIRED_PERSONALIZATION") {
    return { allow_normal_purchase: false, personalization_required: true }
  }
  return { allow_normal_purchase: true, personalization_required: false }
}

/**
 * Reducer helper for toggle synchronization. When the admin enables one
 * purchase option, the mutually-exclusive option is disabled automatically.
 * This prevents the invalid `true + true` state from ever reaching the API.
 */
export function syncPurchaseModeToggles(
  current: Pick<TemplateDraft, "allow_normal_purchase" | "personalization_required">,
  patch: Partial<Pick<TemplateDraft, "allow_normal_purchase" | "personalization_required">>
): { allow_normal_purchase: boolean; personalization_required: boolean } {
  const next = { ...current, ...patch }
  // Enforce mutual exclusivity: enabling one disables the other.
  if (patch.allow_normal_purchase === true) {
    next.personalization_required = false
  }
  if (patch.personalization_required === true) {
    next.allow_normal_purchase = false
  }
  // Never allow the invalid state.
  if (next.allow_normal_purchase === true && next.personalization_required === true) {
    next.allow_normal_purchase = false
  }
  return next
}

export const newPersonalizationField = (
  label = "",
  fieldType = "text",
  extra: Partial<PersonalizationFieldDraft> = {}
): PersonalizationFieldDraft => ({
  key: "",
  label,
  field_type: fieldType,
  is_required: false,
  help_text: "",
  placeholder: "",
  min_length: "",
  max_length: "",
  min_value: "",
  max_value: "",
  allowed_values: "",
  price_adjustment: "0",
  // One-based deterministic ordering: the first field is sort_order 1.
  sort_order: 1,
  ...extra,
})

export const PERSONALIZATION_PRESETS: Record<string, { label: string; fields: PersonalizationFieldDraft[] }> = {
  cake: {
    label: "Cake Personalization",
    fields: [
      newPersonalizationField("Name on Cake", "text", { is_required: true, max_length: "60" }),
      newPersonalizationField("Cake Message", "textarea", { max_length: "250" }),
      newPersonalizationField("Theme Color", "color"),
      newPersonalizationField("Reference Image", "image_upload"),
      newPersonalizationField("Special Instructions", "textarea", { max_length: "1000" }),
    ],
  },
  gift: {
    label: "Gift Personalization",
    fields: [
      newPersonalizationField("Recipient Name", "text", { is_required: true, max_length: "100" }),
      newPersonalizationField("Gift Message", "textarea", { max_length: "500" }),
      newPersonalizationField("Wrapping Option", "select", { allowed_values: "Standard, Premium, Eco-friendly" }),
    ],
  },
  printed: {
    label: "Printed Product",
    fields: [
      newPersonalizationField("Custom Text", "text", { is_required: true, max_length: "200" }),
      newPersonalizationField("Font", "select", { allowed_values: "Classic, Modern, Script, Bold" }),
      newPersonalizationField("Text Color", "color"),
      newPersonalizationField("Upload Design", "image_upload"),
    ],
  },
}

export function presetFields(name: string): PersonalizationFieldDraft[] {
  const preset = PERSONALIZATION_PRESETS[name]
  return preset ? preset.fields.map((item, index) => ({ ...item, sort_order: index })) : []
}

export function toFieldDrafts(template?: PersonalizationTemplate | null): PersonalizationFieldDraft[] {
  return (template?.fields || []).map((item, index) => ({
    key: String(item.key || ""),
    label: String(item.label || ""),
    field_type: String(item.field_type || "text"),
    is_required: Boolean(item.is_required),
    help_text: String(item.help_text || ""),
    placeholder: String(item.placeholder || ""),
    min_length: item.min_length == null ? "" : String(item.min_length),
    max_length: item.max_length == null ? "" : String(item.max_length),
    min_value: item.min_value == null ? "" : String(item.min_value),
    max_value: item.max_value == null ? "" : String(item.max_value),
    allowed_values: Array.isArray(item.allowed_values)
      ? item.allowed_values.join(", ")
      : String(item.allowed_values || ""),
    price_adjustment: String(item.price_adjustment || 0),
    sort_order: Number(item.sort_order ?? index),
  }))
}

export function lifecycleOf(template: PersonalizationTemplate): PersonalizationLifecycle {
  const explicit = String(
    template.lifecycle_status || template.status || template.metadata?.lifecycle_status || ""
  ).trim().toLowerCase()
  if (explicit === "archived" || template.archived_at || template.deleted_at) return "archived"
  if (explicit === "active" || template.is_active) return "active"
  return "draft"
}

export function fieldCountOf(template: PersonalizationTemplate): number {
  const count = Number(template.field_count)
  return Number.isFinite(count) && count >= 0 ? count : (template.fields || []).length
}

export function productTitleOf(
  template: PersonalizationTemplate,
  productById: Map<string, PersonalizationProduct>
): string {
  return String(
    template.product_title || template.product?.title || productById.get(template.product_id)?.title || "Unknown product"
  )
}

export function productHandleOf(
  template: PersonalizationTemplate,
  productById: Map<string, PersonalizationProduct>
): string | null {
  const handle = template.product_handle || template.product?.handle || productById.get(template.product_id)?.handle
  return handle ? String(handle) : null
}

export function variantTitleOf(
  template: PersonalizationTemplate,
  productById: Map<string, PersonalizationProduct>
): string | null {
  if (!template.variant_id) return null
  const embedded = template.variant_title || template.variant?.title
  if (embedded) return String(embedded)
  const product = template.product || productById.get(template.product_id)
  const variant = product?.variants?.find((item) => item.id === template.variant_id)
  return String(variant?.title || variant?.sku || "Unknown variant")
}

export function formatUpdatedAt(value?: string | null): string {
  if (!value) return "Not recorded"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not recorded"
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function normalizeFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function withGeneratedFieldKeys(fields: PersonalizationFieldDraft[]): PersonalizationFieldDraft[] {
  return fields.map((item, index) => ({
    ...item,
    key: normalizeFieldKey(item.key || item.label || `field_${index + 1}`),
    sort_order: Number.isInteger(Number(item.sort_order)) ? Number(item.sort_order) : index,
  }))
}

/**
 * Type-specific payload serializer. For image_upload, returns only the
 * relevant properties: allowed_values as a MIME type array and
 * validation_rules with max_file_size_mb and max_files.
 * Blank values are omitted, not converted to zero.
 */
export function buildPersonalizationFieldPayload(field: PersonalizationFieldDraft) {
  const payload: Record<string, any> = {
    key: field.key,
    label: field.label.trim(),
    field_type: field.field_type,
    is_required: Boolean(field.is_required),
    price_adjustment: Number(field.price_adjustment || 0),
    sort_order: Number(field.sort_order),
  }

  if (field.help_text?.trim()) {
    payload.help_text = field.help_text.trim()
  } else {
    payload.help_text = null
  }

  if (field.placeholder?.trim()) {
    payload.placeholder = field.placeholder.trim()
  } else {
    payload.placeholder = null
  }

  const type = field.field_type
  if (type === "text" || type === "textarea") {
    // Blank length values are omitted entirely (never sent as null or 0) so
    // downstream validation treats them as "not configured".
    if (field.min_length !== "" && field.min_length !== null && field.min_length !== undefined) {
      payload.min_length = Number(field.min_length)
    }
    if (field.max_length !== "" && field.max_length !== null && field.max_length !== undefined) {
      payload.max_length = Number(field.max_length)
    }
  } else if (type === "number") {
    // Blank range values are omitted entirely for the same contract.
    if (field.min_value !== "" && field.min_value !== null && field.min_value !== undefined) {
      payload.min_value = Number(field.min_value)
    }
    if (field.max_value !== "" && field.max_value !== null && field.max_value !== undefined) {
      payload.max_value = Number(field.max_value)
    }
  } else if (["select", "radio"].includes(type)) {
    if (field.allowed_values && typeof field.allowed_values === "string") {
      payload.allowed_values = field.allowed_values.split(",").map((value) => value.trim()).filter(Boolean)
    } else if (Array.isArray(field.allowed_values)) {
      payload.allowed_values = field.allowed_values
    } else {
      payload.allowed_values = null
    }
  } else if (type === "color") {
    if (field.allowed_values && typeof field.allowed_values === "string") {
      payload.allowed_values = field.allowed_values.split(",").map((value) => value.trim()).filter(Boolean)
    } else if (Array.isArray(field.allowed_values)) {
      payload.allowed_values = field.allowed_values
    } else {
      payload.allowed_values = null
    }
  } else if (type === "image_upload") {
    // Image upload: convert MIME string to array, trim, deduplicate.
    // Send validation_rules with max_file_size_mb and max_files.
    if (field.allowed_values && typeof field.allowed_values === "string") {
      payload.allowed_values = field.allowed_values
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
      // Deduplicate
      payload.allowed_values = [...new Set(payload.allowed_values)]
    } else if (Array.isArray(field.allowed_values)) {
      payload.allowed_values = [...new Set(field.allowed_values.map((v) => String(v).trim().toLowerCase()).filter(Boolean))]
    } else {
      payload.allowed_values = null
    }
    // Default validation rules for image upload
    payload.validation_rules = {
      max_file_size_mb: 5,
      max_files: 1,
    }
  }

  return payload
}

export function validateTemplateDraft(draft: TemplateDraft): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = []
  const title = draft.title.trim()
  if (!title) issues.push({ code: "PERSONALIZATION_TEMPLATE_TITLE_REQUIRED", message: "Template title is required." })
  if (title.length > PERSONALIZATION_TITLE_MAX_LENGTH) {
    issues.push({ code: "PERSONALIZATION_TEMPLATE_TITLE_TOO_LONG", message: `Template title must be ${PERSONALIZATION_TITLE_MAX_LENGTH} characters or fewer.` })
  }
  if (!draft.product_id.trim()) issues.push({ code: "PERSONALIZATION_PRODUCT_REQUIRED", message: "Select a product." })
  if (!draft.fields.length) issues.push({ code: "PERSONALIZATION_FIELDS_REQUIRED", message: "Add at least one field." })

  // Enforce required-personalization logical consistency
  if (draft.personalization_required === true) {
    if (draft.allow_normal_purchase === true) {
      issues.push({
        code: "PERSONALIZATION_REQUIRED_CONFLICT",
        message: "Personalization cannot be required if normal purchase is allowed.",
      })
    }
    const hasRequiredField = draft.fields.some((f) => Boolean(f.is_required))
    if (!hasRequiredField) {
      issues.push({
        code: "PERSONALIZATION_REQUIRED_FIELD_MISSING",
        message: "Required personalization must contain at least one required field.",
      })
    }
  }

  const keys = new Set<string>()
  withGeneratedFieldKeys(draft.fields).forEach((item, fieldIndex) => {
    const key = item.key.trim()
    const label = item.label.trim()
    if (!key) issues.push({ code: "PERSONALIZATION_FIELD_KEY_REQUIRED", message: `Field ${fieldIndex + 1} requires a key.`, fieldIndex })
    if (key && keys.has(key)) issues.push({ code: "PERSONALIZATION_FIELD_KEY_DUPLICATE", message: `Field key “${key}” is duplicated.`, fieldIndex })
    keys.add(key)
    if (!label) issues.push({ code: "PERSONALIZATION_FIELD_LABEL_REQUIRED", message: `Field ${fieldIndex + 1} requires a label.`, fieldIndex })
    if (!supportedFieldTypes.has(item.field_type)) issues.push({ code: "PERSONALIZATION_FIELD_TYPE_INVALID", message: `Field ${fieldIndex + 1} has an unsupported type.`, fieldIndex })
    
    // Select options checks
    if (["select", "radio"].includes(item.field_type)) {
      if (!item.allowed_values.split(",").some((value) => value.trim())) {
        issues.push({ code: "PERSONALIZATION_SELECT_OPTIONS_REQUIRED", message: `“${label || `Field ${fieldIndex + 1}`}” requires at least one option.`, fieldIndex })
      }
    }

    // Image upload MIME type checks
    if (item.field_type === "image_upload") {
      const mimes = item.allowed_values.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)
      if (mimes.length === 0) {
        issues.push({ code: "PERSONALIZATION_IMAGE_MIME_TYPES_REQUIRED", message: `“${label || `Field ${fieldIndex + 1}`}” requires at least one allowed image type.`, fieldIndex })
      } else {
        const allowedMimes = new Set(["image/jpeg", "image/png", "image/webp"])
        for (const mime of mimes) {
          if (!allowedMimes.has(mime)) {
            issues.push({ code: "PERSONALIZATION_IMAGE_MIME_TYPE_INVALID", message: `Allowed image types are JPEG, PNG, and WEBP.`, fieldIndex })
            break
          }
        }
      }
    }
    
    const surcharge = Number(item.price_adjustment)
    if (!Number.isFinite(surcharge) || surcharge < 0) issues.push({ code: "PERSONALIZATION_FIELD_SURCHARGE_INVALID", message: `“${label || `Field ${fieldIndex + 1}`}” requires a non-negative surcharge.`, fieldIndex })
    const sortOrder = Number(item.sort_order)
    if (!Number.isInteger(sortOrder) || sortOrder < 0) issues.push({ code: "PERSONALIZATION_FIELD_SORT_ORDER_INVALID", message: `“${label || `Field ${fieldIndex + 1}`}” requires a non-negative integer sort order.`, fieldIndex })

    const minLength = item.min_length === "" ? null : Number(item.min_length)
    const maxLength = item.max_length === "" ? null : Number(item.max_length)
    const minValue = item.min_value === "" ? null : Number(item.min_value)
    const maxValue = item.max_value === "" ? null : Number(item.max_value)

    if (item.field_type === "text" || item.field_type === "textarea") {
      if (minValue != null || maxValue != null) {
        issues.push({ code: "PERSONALIZATION_TEXT_NUMERIC_RANGE_NOT_ALLOWED", message: `“${label}” is a Text field and does not support numeric min/max values.`, fieldIndex })
      }
      if (minLength != null && (!Number.isInteger(minLength) || minLength < 0)) issues.push({ code: "PERSONALIZATION_FIELD_LENGTH_INVALID", message: `“${label}” has an invalid minimum length.`, fieldIndex })
      if (maxLength != null && (!Number.isInteger(maxLength) || maxLength < 1)) issues.push({ code: "PERSONALIZATION_FIELD_LENGTH_INVALID", message: `“${label}” has an invalid maximum length.`, fieldIndex })
      if (minLength != null && maxLength != null && minLength > maxLength) issues.push({ code: "PERSONALIZATION_FIELD_LENGTH_INVALID", message: `“${label}” minimum length cannot exceed maximum length.`, fieldIndex })
    } else if (item.field_type === "number") {
      if (minLength != null || maxLength != null) {
        issues.push({ code: "PERSONALIZATION_NUMBER_LENGTH_NOT_ALLOWED", message: `“${label}” is a Number field and does not support minimum/maximum character lengths.`, fieldIndex })
      }
      if (minValue != null && !Number.isFinite(minValue)) issues.push({ code: "PERSONALIZATION_FIELD_RANGE_INVALID", message: `“${label}” has an invalid minimum value.`, fieldIndex })
      if (maxValue != null && !Number.isFinite(maxValue)) issues.push({ code: "PERSONALIZATION_FIELD_RANGE_INVALID", message: `“${label}” has an invalid maximum value.`, fieldIndex })
      if (minValue != null && maxValue != null && minValue > maxValue) issues.push({ code: "PERSONALIZATION_FIELD_RANGE_INVALID", message: `“${label}” minimum value cannot exceed maximum value.`, fieldIndex })
    } else {
      if (minLength != null || maxLength != null || minValue != null || maxValue != null) {
        issues.push({ code: "PERSONALIZATION_FIELD_VALIDATION_INVALID", message: `“${label}” of type ${item.field_type} does not support validation range/length options.`, fieldIndex })
      }
    }
  })
  return issues
}

export function canActivateSummary(template: PersonalizationTemplate): boolean {
  return lifecycleOf(template) === "draft" && fieldCountOf(template) > 0 && template.fields_valid !== false
}

export function templateActionAvailability(template: PersonalizationTemplate) {
  const lifecycle = lifecycleOf(template)
  return {
    view: true,
    edit: lifecycle !== "archived",
    preview: fieldCountOf(template) > 0,
    activate: canActivateSummary(template),
    deactivate: lifecycle === "active",
    duplicate: true,
    archive: lifecycle !== "archived",
    bulkAssign: lifecycle !== "archived" && fieldCountOf(template) > 0,
  }
}

export function templateDraftPayload(draft: TemplateDraft) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || undefined,
    product_id: draft.product_id,
    variant_id: draft.variant_id || undefined,
    allow_normal_purchase: draft.allow_normal_purchase,
    personalization_required: draft.personalization_required,
    fields: withGeneratedFieldKeys(draft.fields).map((item) => buildPersonalizationFieldPayload(item)),
  }
}

export function draftFromTemplate(template: PersonalizationTemplate): TemplateDraft {
  return {
    title: template.title || "",
    description: template.description || "",
    product_id: template.product_id,
    variant_id: template.variant_id || "",
    allow_normal_purchase: template.metadata?.allow_normal_purchase !== false,
    personalization_required: Boolean(template.metadata?.personalization_required),
    fields: toFieldDrafts(template),
  }
}

export function apiErrorMessage(body: any, fallback: string): string {
  const code = body?.code || ""
  if (code === "UNAUTHORIZED" || body?.status === 401 || body?.message === "Unauthorized") {
    return "Your Admin session expired. Sign in again."
  }
  if (code === "PERSONALIZATION_PRODUCT_TEMPLATE_ALREADY_ACTIVE") {
    return "This product already has an active product-level template. Edit it or create a new version."
  }
  if (code === "PERSONALIZATION_VARIANT_TEMPLATE_ALREADY_ACTIVE") {
    return "This product variant already has an active personalization template. Edit it or create a new version."
  }
  if (code === "PERSONALIZATION_REQUIRED_CONFLICT") {
    return "Turn off Normal Purchase when personalization is required."
  }
  if (code === "PERSONALIZATION_REQUIRED_FIELD_MISSING") {
    return "Mark at least one customer field as required."
  }
  if (code === "PERSONALIZATION_IMAGE_MIME_TYPES_REQUIRED") {
    return "Add at least one allowed image type."
  }
  if (code === "PERSONALIZATION_IMAGE_MIME_TYPE_INVALID") {
    return "Allowed image types are JPEG, PNG, and WEBP."
  }
  if (code === "PERSONALIZATION_IMAGE_MAX_SIZE_INVALID") {
    return "Maximum file size must be a positive supported value."
  }
  if (code === "PERSONALIZATION_IMAGE_MAX_FILES_INVALID") {
    return "Maximum files must be an integer between 1 and 10."
  }
  if (code === "PERSONALIZATION_VERSION_CONFLICT") {
    return "This template was modified by another administrator. Reload before saving."
  }

  const prefix = code ? `${code}: ` : ""
  return `${prefix}${body?.message || fallback}`
}