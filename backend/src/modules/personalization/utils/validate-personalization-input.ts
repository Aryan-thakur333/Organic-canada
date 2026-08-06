import { PERSONALIZATION_FIELD_TYPES, type PersonalizationFieldType } from "../constants/field-types"

export interface PersonalizationTemplateLike {
  is_active: boolean
}

export interface PersonalizationFieldLike {
  key: string
  field_type: string
  is_required: boolean
  min_length: number | null
  max_length: number | null
  min_value: number | null
  max_value: number | null
  allowed_values: any[] | null
  price_adjustment: number
}

export interface PersonalizationValidationInput {
  template: PersonalizationTemplateLike
  fields: PersonalizationFieldLike[]
  submittedValues: Record<string, any>
  verifiedUploadIds?: ReadonlySet<string>
}

export interface PersonalizationValidationResult {
  normalizedValues: Record<string, any>
  priceAdjustment: number
  validationSnapshot: Record<string, any>
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function isValidDate(value: string): boolean {
  const d = new Date(value)
  return !isNaN(d.getTime()) && value.trim() === d.toISOString().slice(0, 10)
}

export function validatePersonalizationInput({
  template,
  fields,
  submittedValues,
  verifiedUploadIds = new Set<string>(),
}: PersonalizationValidationInput): PersonalizationValidationResult {
  if (!template.is_active) {
    throw new Error("Template is not active")
  }

  const fieldMap = new Map<string, PersonalizationFieldLike>()
  for (const f of fields) {
    if ((f as any).is_active === false) {
      continue
    }
    if (fieldMap.has(f.key)) {
      throw new Error("Duplicate field keys are not allowed")
    }
    if (!(PERSONALIZATION_FIELD_TYPES as readonly string[]).includes(f.field_type)) {
      throw new Error("Unsupported personalization field type")
    }
    fieldMap.set(f.key, f)
  }
  if (fieldMap.size > 25) {
    throw new Error("Personalization templates may contain at most 25 fields")
  }

  const normalizedValues: Record<string, any> = {}
  let priceAdjustment = 0
  const validationSnapshot: Record<string, any> = {}

  for (const [key, field] of fieldMap.entries()) {
    const raw = submittedValues[key]
    const snapshot: any = { key, field_type: field.field_type, submitted: raw }

    if (raw === undefined || raw === null || raw === "") {
      if (field.is_required) {
        snapshot.error = "REQUIRED"
        validationSnapshot[key] = snapshot
        throw new Error("Required field missing")
      }
      validationSnapshot[key] = snapshot
      continue
    }

    switch (field.field_type) {
      case "text":
      case "textarea": {
        const value = String(raw).trim()
        const len = value.length
        const effectiveMax = Math.min(field.max_length ?? 5000, 5000)
        if (field.min_length !== null && len < field.min_length) {
          snapshot.error = "MIN_LENGTH"
          validationSnapshot[key] = snapshot
          throw new Error("Text below min length")
        }
        if (len > effectiveMax) {
          snapshot.error = "MAX_LENGTH"
          validationSnapshot[key] = snapshot
          throw new Error("Text above max length")
        }
        normalizedValues[key] = value
        break
      }
      case "number": {
        const num = Number(raw)
        if (Number.isNaN(num)) {
          snapshot.error = "INVALID_NUMBER"
          validationSnapshot[key] = snapshot
          throw new Error("Invalid number")
        }
        if (field.min_value !== null && num < field.min_value) {
          snapshot.error = "MIN_VALUE"
          validationSnapshot[key] = snapshot
          throw new Error("Number below min value")
        }
        if (field.max_value !== null && num > field.max_value) {
          snapshot.error = "MAX_VALUE"
          validationSnapshot[key] = snapshot
          throw new Error("Number above max value")
        }
        normalizedValues[key] = num
        break
      }
      case "date": {
        if (!isValidDate(String(raw))) {
          snapshot.error = "INVALID_DATE"
          validationSnapshot[key] = snapshot
          throw new Error("Invalid date")
        }
        normalizedValues[key] = String(raw)
        break
      }
      case "select":
      case "radio": {
        const allowed = Array.isArray(field.allowed_values) ? field.allowed_values : []
        if (!allowed.includes(raw)) {
          snapshot.error = "INVALID_OPTION"
          validationSnapshot[key] = snapshot
          throw new Error("Invalid select option")
        }
        normalizedValues[key] = raw
        break
      }
      case "checkbox":
      case "boolean": {
        if (raw !== true && raw !== false && raw !== "true" && raw !== "false") {
          throw new Error("Invalid boolean")
        }
        normalizedValues[key] = raw === true || raw === "true"
        break
      }
      case "color": {
        if (!isHexColor(String(raw))) {
          snapshot.error = "INVALID_COLOR"
          validationSnapshot[key] = snapshot
          throw new Error("Invalid color format")
        }
        normalizedValues[key] = String(raw)
        break
      }
      case "image_upload": {
        if (typeof raw !== "string" || !verifiedUploadIds.has(raw)) {
          snapshot.error = "INVALID_UPLOAD_REFERENCE"
          validationSnapshot[key] = snapshot
          throw new Error("Upload reference is invalid or not owned by this customer")
        }
        normalizedValues[key] = raw
        break
      }
      default:
        snapshot.error = "UNSUPPORTED_TYPE"
        validationSnapshot[key] = snapshot
        throw new Error("Unsupported personalization field type")
    }

    const shouldCharge = field.field_type === "checkbox" || field.field_type === "boolean"
      ? normalizedValues[key] === true
      : normalizedValues[key] !== undefined
    if (shouldCharge && field.price_adjustment) {
      priceAdjustment += Number(field.price_adjustment) || 0
    }

    validationSnapshot[key] = snapshot
  }

  for (const key of Object.keys(submittedValues)) {
    if (!fieldMap.has(key)) {
      throw new Error("Unknown submitted field")
    }
  }

  return {
    normalizedValues,
    priceAdjustment,
    validationSnapshot,
  }
}
