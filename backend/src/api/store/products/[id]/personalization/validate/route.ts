import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../../../modules/personalization"
import { validatePersonalizationInput } from "../../../../../../modules/personalization/utils/validate-personalization-input"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const personalizationService: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const productId = req.params.id
    const { variant_id, values } = req.body as any

    const template = await personalizationService.getActiveTemplate(productId, variant_id)

    if (!template) {
      return res.status(404).json({
        code: "PERSONALIZATION_TEMPLATE_NOT_FOUND",
        message: "No personalization template found",
      })
    }
    
    if (!template.is_active) {
      return res.status(404).json({
        code: "PERSONALIZATION_TEMPLATE_NOT_PUBLISHED",
        message: "Template is not active",
      })
    }

    try {
      const result = validatePersonalizationInput({
        template: template as any,
        fields: (template.fields || []) as any,
        submittedValues: values || {},
      })

      return res.status(200).json({
        normalized_values: result.normalizedValues,
        price_adjustment: result.priceAdjustment,
        template_id: template.id,
        template_version: template.version,
        schema_hash: template.schema_hash,
        validation_snapshot: result.validationSnapshot
      })
    } catch (error: any) {
      return res.status(422).json({
        code: "PERSONALIZATION_VALIDATION_FAILED",
        message: error.message || "Validation failed",
        details: [
          {
            field: "unknown",
            reason: error.message
          }
        ]
      })
    }
  } catch (error: any) {
    console.error("Store Validate personalization Error:", error)
    return res.status(500).json({
      message: error.message || "Failed to validate personalization",
    })
  }
}