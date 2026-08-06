import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../modules/personalization"
import {
  normalizePersonalizationError,
  personalizationError,
} from "../../../../modules/personalization/errors"
import {
  getTemplateLifecycleStatus,
  lifecycleMetadata,
  validateTemplateDescription,
  validateTemplateTitle,
} from "../../../../modules/personalization/utils/template-validation"

function decorate(template: any) {
  const status = getTemplateLifecycleStatus(template)
  return {
    ...template,
    status: status.toUpperCase(),
    lifecycle_status: status,
    assignment_scope: template.variant_id ? "VARIANT" : "PRODUCT",
    field_count: (template.fields || []).length,
    fields: template.fields || [],
  }
}

function ensureOwnership(template: any, vendorId: string) {
  if (!template || template.vendor_id !== vendorId) {
    personalizationError(
      "PERSONALIZATION_FORBIDDEN",
      "You cannot manage personalization settings for this product.",
      403
    )
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const vendorId = (req as any).vendor?.id
    if (!vendorId) return res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" })
    const template = await service.getTemplateWithFields(req.params.id)
    ensureOwnership(template, vendorId)
    return res.status(200).json({ template: decorate(template) })
  } catch (error: any) {
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_TEMPLATE_RETRIEVE_FAILED",
      "Unable to retrieve personalization template."
    )
    return res.status(normalized.status).json(normalized.body)
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const vendorId = (req as any).vendor?.id
    const body = (req.body || {}) as Record<string, any>
    if (!vendorId) return res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" })
    const existing = await service.getTemplateWithFields(req.params.id)
    ensureOwnership(existing, vendorId)
    const status = getTemplateLifecycleStatus(existing)
    if (status === "archived") {
      personalizationError(
        "PERSONALIZATION_TEMPLATE_ARCHIVED",
        "Archived personalization templates are immutable.",
        409
      )
    }
    if (status === "active") {
      personalizationError(
        "PERSONALIZATION_ACTIVE_EDIT_REQUIRES_NEW_VERSION",
        "Active templates cannot be edited through the vendor endpoint. Create a new Draft version first.",
        409
      )
    }
    const currentVersion = Math.max(1, Number(existing.version) || 1)
    if (body.expected_version !== undefined && Number(body.expected_version) !== currentVersion) {
      personalizationError(
        "PERSONALIZATION_VERSION_CONFLICT",
        "This template was changed by another user. Reload it before saving.",
        409,
        { expected_version: Number(body.expected_version), current_version: currentVersion }
      )
    }

    const title = validateTemplateTitle(body.title ?? existing.title)
    const description = validateTemplateDescription(
      body.description === undefined ? existing.description : body.description
    )
    const lineageId = String(existing.version_lineage_id || existing.metadata?.version_lineage_id || existing.id)
    await service.assertUniqueTemplateTitle({
      productId: existing.product_id,
      variantId: existing.variant_id,
      title,
      excludeTemplateId: existing.id,
      versionLineageId: lineageId,
    })
    await service.updatePersonalizationTemplates({
      id: existing.id,
      title,
      description,
      requires_vendor_approval:
        body.requires_vendor_approval ?? existing.requires_vendor_approval,
      requires_production: body.requires_production ?? existing.requires_production,
      version: currentVersion + 1,
      status: "draft",
      is_active: false,
      metadata: lifecycleMetadata(existing.metadata, "draft"),
    })
    const updated = await service.getTemplateWithFields(existing.id)
    return res.status(200).json({ template: decorate(updated) })
  } catch (error: any) {
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_TEMPLATE_UPDATE_FAILED",
      "Unable to update personalization template.",
      422
    )
    return res.status(normalized.status).json(normalized.body)
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const vendorId = (req as any).vendor?.id
    if (!vendorId) return res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" })
    const existing = await service.retrievePersonalizationTemplate(req.params.id)
    ensureOwnership(existing, vendorId)
    await service.archiveTemplate(existing.id)
    return res.status(200).json({ success: true, message: "Template archived" })
  } catch (error: any) {
    if (String(error?.message || "").includes("was not found")) {
      return res.status(200).json({ success: true })
    }
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_TEMPLATE_ARCHIVE_FAILED",
      "Unable to archive personalization template."
    )
    return res.status(normalized.status).json(normalized.body)
  }
}
