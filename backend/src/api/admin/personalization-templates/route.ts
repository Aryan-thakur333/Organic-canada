import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../modules/personalization"
import { normalizePersonalizationError } from "../../../modules/personalization/errors"
import { toPersonalizationFieldRecord } from "../../../modules/personalization/utils/field-persistence"
import { normalizePersonalizationFieldKeys } from "../../../modules/personalization/utils/field-key"
import {
  getTemplateLifecycleStatus,
  lifecycleMetadata,
  requireSuppliedFieldKeys,
  validateTemplateDefinition,
} from "../../../modules/personalization/utils/template-validation"

function integerQuery(value: unknown, fallback: number, maximum?: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return fallback
  return maximum === undefined ? parsed : Math.min(parsed, maximum)
}

function optionalString(value: unknown) {
  const normalized = String(value ?? "").trim()
  return normalized || undefined
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const query: any = req.scope.resolve("query")
    const limit = Math.max(1, integerQuery(req.query.limit, 25, 100))
    const offset = integerQuery(req.query.offset, 0)
    const filters: Record<string, any> = {}
    const productId = optionalString(req.query.product_id)
    const status = optionalString(req.query.status)?.toLowerCase()
    if (productId) filters.product_id = productId
    if (status && ["draft", "active", "archived"].includes(status)) filters.status = status

    // Load templates without specifying invalid select columns
    const [templates, count] = await service.listAndCountPersonalizationTemplates(
      filters,
      {
        order: { updated_at: "DESC" },
        skip: offset,
        take: limit,
      }
    )

    const templateIds = (templates || []).map((template: any) => template.id)
    const productIds = Array.from(new Set((templates || []).map((template: any) => template.product_id).filter(Boolean))) as string[]
    const variantIds = Array.from(new Set((templates || []).map((template: any) => template.variant_id).filter(Boolean))) as string[]

    // Execute bulk queries in parallel
    const [fieldCounts, productResult, variantResult] = await Promise.all([
      service.listTemplateFieldCounts(templateIds),
      productIds.length
        ? query.graph({
            entity: "product",
            fields: ["id", "title", "handle"],
            filters: { id: productIds },
          })
        : Promise.resolve({ data: [] }),
      variantIds.length
        ? query.graph({
            entity: "product_variant",
            fields: ["id", "title", "sku", "product_id"],
            filters: { id: variantIds },
          })
        : Promise.resolve({ data: [] }),
    ])

    const productsMap = new Map<string, any>(
      (productResult?.data || []).map((product: any) => [product.id, product])
    )
    const variantsMap = new Map<string, any>(
      (variantResult?.data || []).map((variant: any) => [variant.id, variant])
    )

    const rows = (templates || []).map((template: any) => {
      const product = productsMap.get(template.product_id)
      const variant = template.variant_id ? variantsMap.get(template.variant_id) : null
      const lifecycleStatus = getTemplateLifecycleStatus(template)
      return {
        id: template.id,
        title: template.title,
        product_id: template.product_id,
        variant_id: template.variant_id || null,
        status: lifecycleStatus.toUpperCase(),
        lifecycle_status: lifecycleStatus,
        is_active: lifecycleStatus === "active",
        version: Math.max(1, Number(template.version) || 1),
        version_lineage_id: template.version_lineage_id || null,
        published_at: template.published_at || null,
        created_at: template.created_at,
        updated_at: template.updated_at,
        assignment_scope: template.variant_id ? "VARIANT" : "PRODUCT",
        field_count: fieldCounts.get(template.id) || 0,
        fields_valid: null,
        product_title: product?.title || null,
        product_handle: product?.handle || null,
        variant_title: variant?.title || variant?.sku || null,
        product: product
          ? { id: product.id, title: product.title, handle: product.handle }
          : { id: template.product_id, title: null, handle: null },
        variant: template.variant_id && variant
          ? {
              id: template.variant_id,
              title: variant.title || null,
              sku: variant.sku || null,
            }
          : null,
      }
    })

    return res.status(200).json({
      templates: rows,
      personalization_templates: rows,
      count,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error("Admin list personalization templates failed", error)
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_TEMPLATE_LIST_FAILED",
      "Unable to list personalization templates."
    )
    return res.status(normalized.status).json(normalized.body)
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body || {}) as Record<string, any>
    const productId = String(body.product_id || "").trim()
    if (!productId) {
      return res.status(400).json({
        code: "PERSONALIZATION_PRODUCT_ID_REQUIRED",
        message: "A Medusa product is required for a personalization template.",
      })
    }

    const suppliedFields = Array.isArray(body.fields) ? body.fields : []
    requireSuppliedFieldKeys(suppliedFields)
    const keyedFields = normalizePersonalizationFieldKeys(suppliedFields)
    const definition = validateTemplateDefinition({
      title: body.title,
      description: body.description,
      fields: keyedFields,
      requireFields: false,
      allow_normal_purchase: body.allow_normal_purchase !== false,
      personalization_required: Boolean(body.personalization_required),
    })

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
    const variantId = body.variant_id ? String(body.variant_id).trim() : null
    if (variantId && !(product.variants || []).some((variant: any) => variant.id === variantId)) {
      return res.status(422).json({
        code: "VARIANT_PRODUCT_MISMATCH",
        message: "The selected variant does not belong to the selected product.",
      })
    }

    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    await service.assertUniqueTemplateTitle({
      productId,
      variantId,
      title: definition.title,
    })
    const metadata = lifecycleMetadata(
      {
        source: "admin",
        allow_normal_purchase: body.allow_normal_purchase !== false,
        personalization_required: Boolean(body.personalization_required),
      },
      "draft"
    )
    const template = await service.createPersonalizationTemplates({
      product_id: productId,
      variant_id: variantId,
      vendor_id: product.metadata?.vendor_id ? String(product.metadata.vendor_id) : null,
      title: definition.title,
      description: definition.description,
      status: "draft",
      is_active: false,
      requires_vendor_approval: Boolean(body.requires_vendor_approval),
      requires_production: Boolean(body.requires_production),
      version: 1,
      metadata,
    })

    const createdFields: any[] = []
    try {
      for (const field of definition.fields) {
        createdFields.push(
          await service.createPersonalizationFields(
            toPersonalizationFieldRecord(template.id, field)
          )
        )
      }
    } catch (error) {
      await service.rollbackDraftTemplateCreation(
        template.id,
        createdFields.map((field) => field.id)
      )
      throw error
    }
    return res.status(201).json({
      template: {
        ...template,
        status: "DRAFT",
        lifecycle_status: "draft",
        assignment_scope: variantId ? "VARIANT" : "PRODUCT",
        field_count: createdFields.length,
        fields: createdFields,
      },
    })
  } catch (error: any) {
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_TEMPLATE_CREATE_FAILED",
      "Unable to create personalization template.",
      422
    )
    return res.status(normalized.status).json(normalized.body)
  }
}
