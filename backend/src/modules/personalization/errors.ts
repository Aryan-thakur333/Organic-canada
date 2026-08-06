export class PersonalizationDomainError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(
    code: string,
    message: string,
    status = 422,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = "PersonalizationDomainError"
    this.code = code
    this.status = status
    this.details = details
  }
}

export function personalizationError(
  code: string,
  message: string,
  status = 422,
  details?: Record<string, unknown>
): never {
  throw new PersonalizationDomainError(code, message, status, details)
}

const CONSTRAINT_ERRORS: Array<{
  constraint: string
  code: string
  message: string
}> = [
  {
    constraint: "UIDX_personalization_template_active_product",
    code: "PERSONALIZATION_PRODUCT_TEMPLATE_ALREADY_ACTIVE",
    message: "This product already has an active all-variants personalization template.",
  },
  {
    constraint: "UIDX_personalization_template_active_variant",
    code: "PERSONALIZATION_VARIANT_TEMPLATE_ALREADY_ACTIVE",
    message: "This product variant already has an active personalization template.",
  },
  {
    constraint: "UIDX_personalization_template_normalized_title_scope",
    code: "PERSONALIZATION_TEMPLATE_TITLE_DUPLICATE",
    message: "A template with the same normalized title already exists for this assignment.",
  },
  {
    constraint: "UIDX_personalization_template_lineage_version",
    code: "PERSONALIZATION_VERSION_CONFLICT",
    message: "Another administrator created this template version first. Reload before editing.",
  },
  {
    constraint: "UIDX_personalization_field_template_key",
    code: "PERSONALIZATION_FIELD_KEY_DUPLICATE",
    message: "Field keys must be unique within a template.",
  },
]

export function normalizePersonalizationError(
  error: any,
  fallbackCode: string,
  fallbackMessage: string,
  fallbackStatus = 500
) {
  if (error instanceof PersonalizationDomainError) {
    return {
      status: error.status,
      body: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    }
  }

  const databaseMessage = String(
    error?.constraint || error?.cause?.constraint || error?.message || ""
  )
  const constraintError = CONSTRAINT_ERRORS.find(({ constraint }) =>
    databaseMessage.includes(constraint)
  )
  if (constraintError) {
    return {
      status: 409,
      body: {
        code: constraintError.code,
        message: constraintError.message,
      },
    }
  }

  if (databaseMessage.includes("was not found")) {
    return {
      status: 404,
      body: {
        code: "PERSONALIZATION_TEMPLATE_NOT_FOUND",
        message: "Personalization template not found.",
      },
    }
  }

  return {
    status: fallbackStatus,
    body: {
      code: fallbackCode,
      message: fallbackMessage,
    },
  }
}
