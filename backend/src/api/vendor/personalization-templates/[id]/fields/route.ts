import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../../modules/personalization"
import {
  normalizePersonalizationError,
  personalizationError,
} from "../../../../../modules/personalization/errors"
import { toPersonalizationFieldRecord } from "../../../../../modules/personalization/utils/field-persistence"
import { validateFieldConfiguration } from "../../../../../modules/personalization/utils/field-configuration"
import {
  getTemplateLifecycleStatus,
  lifecycleMetadata,
} from "../../../../../modules/personalization/utils/template-validation"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const vendorId = (req as any).vendor?.id
    const templateId = req.params.id
    const body = (req.body || {}) as Record<string, any>
    if (!vendorId) return res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" })

    const existing = await service.getTemplateWithFields(templateId)
    if (!existing || existing.vendor_id !== vendorId) {
      return res.status(403).json({
        code: "PERSONALIZATION_FORBIDDEN",
        message: "You cannot manage personalization settings for this product.",
      })
    }
    if (getTemplateLifecycleStatus(existing) !== "draft") {
      personalizationError(
        "PERSONALIZATION_ACTIVE_EDIT_REQUIRES_NEW_VERSION",
        "Only Draft templates can be structurally edited.",
        409
      )
    }
    if ((existing.fields?.length || 0) >= 25) {
      personalizationError(
        "PERSONALIZATION_TEMPLATE_TOO_MANY_FIELDS",
        "A template may contain at most 25 fields."
      )
    }
    if (existing.fields?.some((field: any) => field.key === String(body.key || "").trim())) {
      personalizationError(
        "PERSONALIZATION_FIELD_KEY_DUPLICATE",
        "Field keys must be unique within a template.",
        409
      )
    }

    const fieldData = validateFieldConfiguration({
      key: body.key,
      label: body.label,
      field_type: body.field_type || "text",
      is_required: Boolean(body.is_required),
      min_length: body.min_length ?? null,
      max_length: body.max_length ?? null,
      min_value: body.min_value ?? null,
      max_value: body.max_value ?? null,
      allowed_values: body.allowed_values ?? null,
      placeholder: body.placeholder ?? null,
      help_text: body.help_text ?? null,
      price_adjustment: body.price_adjustment ?? 0,
      sort_order: body.sort_order ?? (existing.fields?.length || 0),
    })
    const field = await service.createPersonalizationFields(
      toPersonalizationFieldRecord(templateId, fieldData)
    )
    await service.updatePersonalizationTemplates({
      id: templateId,
      version: Math.max(1, Number(existing.version) || 1) + 1,
      status: "draft",
      is_active: false,
      metadata: lifecycleMetadata(existing.metadata, "draft"),
    })
    return res.status(201).json({ field })
  } catch (error: any) {
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_FIELD_CREATE_FAILED",
      "Unable to create personalization field.",
      422
    )
    return res.status(normalized.status).json(normalized.body)
  }
}
