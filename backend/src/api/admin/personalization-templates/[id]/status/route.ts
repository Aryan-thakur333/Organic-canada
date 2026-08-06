import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../../modules/personalization"
import {
  normalizePersonalizationError,
  personalizationError,
} from "../../../../../modules/personalization/errors"
import { getTemplateLifecycleStatus } from "../../../../../modules/personalization/utils/template-validation"

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const templateId = req.params.id
    const body = (req.body || {}) as Record<string, any>
    const template = await service.retrievePersonalizationTemplate(templateId)
    const expectedVersion = body.expected_version == null ? undefined : Number(body.expected_version)
    const currentVersion = Math.max(1, Number(template.version) || 1)
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      personalizationError(
        "PERSONALIZATION_VERSION_CONFLICT",
        "This template was changed by another administrator. Reload it before changing its status.",
        409,
        { expected_version: expectedVersion, current_version: currentVersion }
      )
    }

    const requestedStatus = String(body.status || "").toLowerCase()
    if (requestedStatus === "archived") {
      return res.status(409).json({
        code: "PERSONALIZATION_ARCHIVE_ENDPOINT_REQUIRED",
        message: "Use the archive action to archive a personalization template.",
      })
    }
    const isActive = requestedStatus === "active"
      ? true
      : requestedStatus === "draft"
        ? false
        : body.is_active
    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        code: "INVALID_REQUEST",
        message: "Provide status as ACTIVE or DRAFT, or provide is_active as a boolean.",
      })
    }
    const updated = isActive
      ? await service.publishTemplate(templateId)
      : await service.deactivateTemplate(templateId)
    const lifecycleStatus = getTemplateLifecycleStatus(updated)
    return res.status(200).json({
      template: {
        ...updated,
        status: lifecycleStatus.toUpperCase(),
        lifecycle_status: lifecycleStatus,
        assignment_scope: updated.variant_id ? "VARIANT" : "PRODUCT",
        field_count: (updated.fields || []).length,
      },
    })
  } catch (error: any) {
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_TEMPLATE_STATUS_UPDATE_FAILED",
      "Unable to update personalization template status."
    )
    return res.status(normalized.status).json(normalized.body)
  }
}
