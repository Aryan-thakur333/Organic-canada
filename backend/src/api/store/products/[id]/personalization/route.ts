import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../../modules/personalization"
import {
  PersonalizationDomainError,
  normalizePersonalizationError,
} from "../../../../../modules/personalization/errors"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const query: any = req.scope.resolve("query")
    const productId = String(req.params.id || "").trim()
    const rawVariantId = req.query.variant_id
    const variantId = Array.isArray(rawVariantId)
      ? String(rawVariantId[0] || "").trim()
      : String(rawVariantId || "").trim() || undefined

    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "status", "variants.id"],
      filters: { id: productId },
    })
    const product = products?.[0]
    if (!product) {
      return res.status(404).json({
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found.",
      })
    }
    if (String(product.status || "").toLowerCase() !== "published") {
      return res.status(404).json({
        code: "PERSONALIZATION_NOT_AVAILABLE",
        message: "Personalization is not available for this product.",
      })
    }
    if (variantId && !(product.variants || []).some((variant: any) => variant.id === variantId)) {
      return res.status(422).json({
        code: "PERSONALIZATION_VARIANT_PRODUCT_MISMATCH",
        message: "The selected variant does not belong to this product.",
      })
    }

    const template = await service.getActiveTemplate(productId, variantId)
    if (!template) {
      return res.status(404).json({
        code: "PERSONALIZATION_NOT_AVAILABLE",
        message: "No personalization template found.",
      })
    }
    service.validateActiveTemplateSchema(template)

    const response = {
      id: template.id,
      product_id: template.product_id,
      variant_id: template.variant_id,
      title: template.title,
      description: template.description,
      is_active: true,
      status: "ACTIVE",
      lifecycle_status: "active",
      assignment_scope: template.variant_id ? "variant" : "all_variants",
      requires_vendor_approval: template.requires_vendor_approval,
      requires_production: template.requires_production,
      allow_normal_purchase: template.metadata?.allow_normal_purchase !== false,
      personalization_required: Boolean(template.metadata?.personalization_required),
      version: template.version,
      schema_hash: template.schema_hash,
      fields: (template.fields || [])
        .slice()
        .sort((left: any, right: any) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
        .map((field: any) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          field_type: field.field_type,
          is_required: field.is_required,
          min_length: field.min_length,
          max_length: field.max_length,
          min_value: field.min_value,
          max_value: field.max_value,
          allowed_values: field.allowed_values,
          placeholder: field.placeholder,
          help_text: field.help_text,
          price_adjustment: field.price_adjustment,
          sort_order: field.sort_order,
        })),
    }

    res.setHeader("Cache-Control", "private, max-age=30, must-revalidate")
    return res.status(200).json({ personalization_enabled: true, template: response })
  } catch (error: any) {
    if (error instanceof PersonalizationDomainError) {
      if (error.code === "PERSONALIZATION_TEMPLATE_AMBIGUOUS") {
        return res.status(409).json({
          code: "PERSONALIZATION_TEMPLATE_AMBIGUOUS",
          message: "Personalization is temporarily unavailable because this product has conflicting active template assignments.",
        })
      }
      if (error.code.startsWith("PERSONALIZATION_FIELD_") || error.code.startsWith("PERSONALIZATION_TEMPLATE_")) {
        return res.status(409).json({
          code: "PERSONALIZATION_TEMPLATE_INVALID",
          message: "The active personalization template is not valid for storefront use.",
        })
      }
    }
    console.error("Store product personalization lookup failed", error)
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_LOOKUP_FAILED",
      "Unable to retrieve personalization for this product."
    )
    return res.status(normalized.status).json(normalized.body)
  }
}
