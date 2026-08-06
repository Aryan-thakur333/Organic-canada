import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../modules/personalization"
import { normalizePersonalizationError } from "../../../modules/personalization/errors"
import {
  getTemplateLifecycleStatus,
  lifecycleMetadata,
  validateTemplateDescription,
  validateTemplateTitle,
} from "../../../modules/personalization/utils/template-validation"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const vendorId = (req as any).vendor?.id
    if (!vendorId) return res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" })

    const templates = await service.listTemplatesWithFields(
      { vendor_id: vendorId },
      { order: { updated_at: "DESC" }, take: 100 }
    )
    return res.status(200).json({
      templates: (templates || []).map((template: any) => {
        const status = getTemplateLifecycleStatus(template)
        return {
          ...template,
          status: status.toUpperCase(),
          lifecycle_status: status,
          assignment_scope: template.variant_id ? "VARIANT" : "PRODUCT",
          field_count: (template.fields || []).length,
          fields: template.fields || [],
        }
      }),
      count: templates?.length || 0,
    })
  } catch (error: any) {
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_LIST_FAILED",
      "Unable to list personalization templates."
    )
    return res.status(normalized.status).json(normalized.body)
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const query: any = req.scope.resolve("query")
    const vendorId = (req as any).vendor?.id
    const body = (req.body || {}) as Record<string, any>
    if (!vendorId) return res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" })

    const productId = String(body.product_id || "").trim()
    if (!productId) {
      return res.status(400).json({
        code: "PERSONALIZATION_PRODUCT_ID_REQUIRED",
        message: "product_id is required.",
      })
    }
    const title = validateTemplateTitle(body.title)
    const description = validateTemplateDescription(body.description)
    const variantId = body.variant_id ? String(body.variant_id).trim() : null

    const { data: vendorProducts } = await query.graph({
      entity: "product",
      fields: ["id", "metadata", "variants.id"],
      filters: { id: productId },
    })
    const product = vendorProducts?.[0]
    if (!product || product.metadata?.vendor_id !== vendorId) {
      return res.status(403).json({
        code: "PERSONALIZATION_FORBIDDEN",
        message: "You cannot manage personalization settings for this product.",
      })
    }
    if (variantId && !(product.variants || []).some((variant: any) => variant.id === variantId)) {
      return res.status(422).json({
        code: "VARIANT_PRODUCT_MISMATCH",
        message: "The selected variant does not belong to the selected product.",
      })
    }

    await service.assertUniqueTemplateTitle({ productId, variantId, title })
    const template = await service.createPersonalizationTemplates({
      product_id: productId,
      variant_id: variantId,
      vendor_id: vendorId,
      title,
      description,
      status: "draft",
      is_active: false,
      requires_vendor_approval: Boolean(body.requires_vendor_approval),
      requires_production: Boolean(body.requires_production),
      version: 1,
      schema_hash: null,
      published_at: null,
      metadata: lifecycleMetadata({ source: "vendor" }, "draft"),
    })
    const created = await service.getTemplateWithFields(template.id)
    return res.status(201).json({
      template: {
        ...created,
        status: "DRAFT",
        lifecycle_status: "draft",
        assignment_scope: variantId ? "VARIANT" : "PRODUCT",
        field_count: 0,
        fields: [],
      },
    })
  } catch (error: any) {
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_CREATE_FAILED",
      "Unable to create personalization template.",
      422
    )
    return res.status(normalized.status).json(normalized.body)
  }
}
