import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../../modules/personalization"
import {
  normalizePersonalizationError,
  personalizationError,
} from "../../../../../modules/personalization/errors"
import { toPersonalizationFieldRecord } from "../../../../../modules/personalization/utils/field-persistence"
import { normalizePersonalizationFieldKeys } from "../../../../../modules/personalization/utils/field-key"
import {
  getTemplateLifecycleStatus,
  lifecycleMetadata,
  requireSuppliedFieldKeys,
  validateTemplateDefinition,
} from "../../../../../modules/personalization/utils/template-validation"

function responseTemplate(template: any) {
  const lifecycleStatus = getTemplateLifecycleStatus(template)
  return {
    ...template,
    status: lifecycleStatus.toUpperCase(),
    lifecycle_status: lifecycleStatus,
    assignment_scope: template.variant_id ? "VARIANT" : "PRODUCT",
    field_count: (template.fields || []).length,
    fields: template.fields || [],
  }
}

function expectedVersion(req: MedusaRequest, body: Record<string, any>) {
  if (body.expected_version !== undefined && body.expected_version !== null) {
    return Number(body.expected_version)
  }
  const ifMatch = String(req.headers["if-match"] || "")
  const versionMatch = ifMatch.match(/(?:^|-)v?(\d+)(?:"|$)/i)
  return versionMatch ? Number(versionMatch[1]) : undefined
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const current = await service.getTemplateWithFields(req.params.id)
    const body = (req.body || {}) as Record<string, any>
    const currentStatus = getTemplateLifecycleStatus(current)
    if (currentStatus === "archived") {
      personalizationError(
        "PERSONALIZATION_TEMPLATE_ARCHIVED",
        "Archived personalization templates are immutable. Duplicate this template to create a new draft.",
        409
      )
    }

    const currentVersion = Math.max(1, Number(current.version) || 1)
    const suppliedExpectedVersion = expectedVersion(req, body)
    if (
      suppliedExpectedVersion !== undefined &&
      (!Number.isInteger(suppliedExpectedVersion) || suppliedExpectedVersion !== currentVersion)
    ) {
      personalizationError(
        "PERSONALIZATION_VERSION_CONFLICT",
        "This template was changed by another administrator. Reload it before saving.",
        409,
        { expected_version: suppliedExpectedVersion, current_version: currentVersion }
      )
    }

    const productId = current.product_id
    const variantId = current.variant_id
    const rawFields = Array.isArray(body.fields) ? body.fields : (current.fields || [])
    requireSuppliedFieldKeys(rawFields)
    const keyedFields = normalizePersonalizationFieldKeys(rawFields)
    const definition = validateTemplateDefinition({
      title: body.title ?? current.title,
      description: body.description === undefined ? current.description : body.description,
      fields: keyedFields,
      requireFields: false,
      allow_normal_purchase: body.allow_normal_purchase === undefined
        ? (current.metadata?.allow_normal_purchase !== false)
        : (body.allow_normal_purchase !== false),
      personalization_required: body.personalization_required === undefined
        ? Boolean(current.metadata?.personalization_required)
        : Boolean(body.personalization_required),
    })

    const versionLineageId = String(current.metadata?.version_lineage_id || current.id)
    
    // Check title uniqueness excluding the same lineage
    await service.assertUniqueTemplateTitle({
      productId,
      variantId,
      title: definition.title,
      excludeTemplateId: current.id,
      versionLineageId,
    })

    const nextVersion = await service.getNextTemplateVersion(current)
    const childMetadata = lifecycleMetadata(
      {
        ...(current.metadata || {}),
        allow_normal_purchase:
          body.allow_normal_purchase ?? current.metadata?.allow_normal_purchase ?? true,
        personalization_required:
          body.personalization_required ?? current.metadata?.personalization_required ?? false,
        version_lineage_id: versionLineageId,
        source_template_id: current.id,
        supersedes_template_id: current.id,
        source_version: currentVersion,
        version_created_at: new Date().toISOString(),
      },
      "draft"
    )
    delete (childMetadata as any).archived_at
    const child = await service.createPersonalizationTemplates({
      product_id: productId,
      variant_id: variantId,
      vendor_id: String(current.vendor_id || ""),
      title: definition.title,
      description: definition.description,
      requires_vendor_approval: current.requires_vendor_approval ?? false,
      requires_production: current.requires_production ?? false,
      version: nextVersion,
      version_lineage_id: versionLineageId,
      schema_hash: null,
      published_at: null,
      status: "draft",
      is_active: false,
      metadata: childMetadata,
    })

    const createdFields: any[] = []
    try {
      for (const field of definition.fields) {
        createdFields.push(await service.createPersonalizationFields(
          toPersonalizationFieldRecord(child.id, field)
        ))
      }
    } catch (error) {
      await service.rollbackDraftTemplateCreation(
        child.id,
        createdFields.map((field) => field.id)
      )
      throw error
    }

    const effective = { ...child, fields: createdFields }
    res.setHeader("Location", `/admin/personalization-templates/${child.id}`)
    res.setHeader("ETag", `W/\"${child.id}-v${child.version}\"`)
    return res.status(201).json({
      template: responseTemplate(effective),
      source_template_id: current.id,
      active_template_preserved: true,
    })
  } catch (error: any) {
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_VERSION_CREATION_FAILED",
      "Unable to create personalization template version."
    )
    return res.status(normalized.status).json(normalized.body)
  }
}
