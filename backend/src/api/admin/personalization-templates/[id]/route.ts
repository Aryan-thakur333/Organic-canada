import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../modules/personalization"
import {
  normalizePersonalizationError,
  personalizationError,
} from "../../../../modules/personalization/errors"
import { toPersonalizationFieldRecord } from "../../../../modules/personalization/utils/field-persistence"
import { normalizePersonalizationFieldKeys } from "../../../../modules/personalization/utils/field-key"
import {
  getTemplateLifecycleStatus,
  lifecycleMetadata,
  requireSuppliedFieldKeys,
  validateTemplateDefinition,
} from "../../../../modules/personalization/utils/template-validation"

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

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const template = await service.getTemplateWithFields(req.params.id)
    const result = responseTemplate(template)
    res.setHeader("ETag", `W/\"${template.id}-v${template.version || 1}\"`)
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({ template: result })
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
    if (body.expected_updated_at !== undefined && body.expected_updated_at !== null) {
      const expectedUpdatedAt = new Date(String(body.expected_updated_at)).getTime()
      const currentUpdatedAt = new Date(current.updated_at).getTime()
      if (
        !Number.isFinite(expectedUpdatedAt) ||
        !Number.isFinite(currentUpdatedAt) ||
        expectedUpdatedAt !== currentUpdatedAt
      ) {
        personalizationError(
          "PERSONALIZATION_VERSION_CONFLICT",
          "This template was changed by another administrator. Reload it before saving.",
          409,
          {
            expected_updated_at: body.expected_updated_at,
            current_updated_at: current.updated_at,
          }
        )
      }
    }

    const productId = String(body.product_id ?? current.product_id).trim()
    const variantId = body.variant_id === undefined
      ? (current.variant_id ? String(current.variant_id) : null)
      : (body.variant_id ? String(body.variant_id).trim() : null)
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

    const requestedStatus = String(body.status || "").toLowerCase()
    if (requestedStatus === "archived") {
      personalizationError(
        "PERSONALIZATION_ARCHIVE_ENDPOINT_REQUIRED",
        "Use the archive action to archive a personalization template.",
        409
      )
    }
    const shouldActivate = requestedStatus === "active"
      ? true
      : requestedStatus === "draft"
        ? false
        : body.is_active === undefined
          ? current.is_active === true
          : Boolean(body.is_active)
    if (shouldActivate) {
      validateTemplateDefinition({
        title: definition.title,
        description: definition.description,
        fields: definition.fields,
        requireFields: true,
        allow_normal_purchase: body.allow_normal_purchase === undefined
          ? (current.metadata?.allow_normal_purchase !== false)
          : (body.allow_normal_purchase !== false),
        personalization_required: body.personalization_required === undefined
          ? Boolean(current.metadata?.personalization_required)
          : Boolean(body.personalization_required),
      })
    }

    const query: any = req.scope.resolve("query")
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "metadata", "variants.id"],
      filters: { id: productId },
    })
    const product = products?.[0]
    if (!product) {
      return res.status(404).json({
        code: "PRODUCT_NOT_FOUND",
        message: "The selected product was not found.",
      })
    }
    if (variantId && !(product.variants || []).some((variant: any) => variant.id === variantId)) {
      return res.status(422).json({
        code: "VARIANT_PRODUCT_MISMATCH",
        message: "The selected variant does not belong to the selected product.",
      })
    }

    const versionLineageId = String(current.metadata?.version_lineage_id || current.id)
    const createNewVersion = currentStatus === "active" && body.create_new_version === true
    if (currentStatus === "active" && !createNewVersion) {
      personalizationError(
        "PERSONALIZATION_ACTIVE_EDIT_REQUIRES_NEW_VERSION",
        "Active templates are immutable. Save this edit as a new Draft version.",
        409
      )
    }

    if (createNewVersion) {
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
        vendor_id: String(product.metadata?.vendor_id || current.vendor_id || ""),
        title: definition.title,
        description: definition.description,
        requires_vendor_approval:
          body.requires_vendor_approval ?? current.requires_vendor_approval ?? false,
        requires_production: body.requires_production ?? current.requires_production ?? false,
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
    }

    await service.assertUniqueTemplateTitle({
      productId,
      variantId,
      title: definition.title,
      excludeTemplateId: current.id,
      versionLineageId,
    })
    if (shouldActivate) {
      await service.assertActiveAssignmentAvailable({
        productId,
        variantId,
        excludeTemplateId: current.id,
      })
    }

    const metadata = lifecycleMetadata(
      {
        ...(current.metadata || {}),
        allow_normal_purchase:
          body.allow_normal_purchase ?? current.metadata?.allow_normal_purchase ?? true,
        personalization_required:
          body.personalization_required ?? current.metadata?.personalization_required ?? false,
      },
      "draft"
    )

    await service.updatePersonalizationTemplates({
      id: current.id,
      product_id: productId,
      variant_id: variantId,
      vendor_id: String(product.metadata?.vendor_id || current.vendor_id || ""),
      title: definition.title,
      description: definition.description,
      requires_vendor_approval:
        body.requires_vendor_approval ?? current.requires_vendor_approval ?? false,
      requires_production: body.requires_production ?? current.requires_production ?? false,
      version: currentVersion + 1,
      status: "draft",
      is_active: false,
      metadata,
    })

    for (const field of current.fields || []) {
      await service.deletePersonalizationFields(field.id)
    }
    for (const field of definition.fields) {
      await service.createPersonalizationFields(
        toPersonalizationFieldRecord(current.id, field)
      )
    }

    const effective = shouldActivate
      ? await service.publishTemplate(current.id, { preserveVersion: true })
      : await service.getTemplateWithFields(current.id)
    const result = responseTemplate(effective)
    res.setHeader("ETag", `W/\"${effective.id}-v${effective.version}\"`)
    return res.status(200).json({ template: result })
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
