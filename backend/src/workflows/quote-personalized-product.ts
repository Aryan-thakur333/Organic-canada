import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { PERSONALIZATION_MODULE } from "../modules/personalization"
import { validatePersonalizationInput } from "../modules/personalization/utils/validate-personalization-input"
import { loadPersonalizationVariant } from "../modules/personalization/utils/pricing"

export type QuotePersonalizedProductInput = {
  variant_id: string
  region_id: string
  values: Record<string, unknown>
  upload_ids?: string[]
  customer_id?: string
}

const quotePersonalizedProductStep = createStep(
  "quote-personalized-product",
  async (input: QuotePersonalizedProductInput, { container }) => {
    const service: any = container.resolve(PERSONALIZATION_MODULE)
    const { variant, basePrice, currencyCode } = await loadPersonalizationVariant(container, input.variant_id, input.region_id)
    const template = await service.getActiveTemplate(variant.product_id || variant.product?.id, input.variant_id)
    if (!template) throw new Error("No active personalization template found")

    const uploadIdsInValues = Object.values(input.values).filter(
      (value): value is string => typeof value === "string" && value.startsWith("past_")
    )
    const declaredUploadIds = Array.isArray(input.upload_ids) ? input.upload_ids : uploadIdsInValues
    if (
      declaredUploadIds.length !== uploadIdsInValues.length ||
      uploadIdsInValues.some((id) => !declaredUploadIds.includes(id))
    ) {
      throw new Error("upload_ids must exactly match image upload field values")
    }

    const verifiedUploadIds = new Set<string>()
    if (uploadIdsInValues.length) {
      if (!input.customer_id) throw new Error("Authentication is required for uploaded images")
      const assets = await service.listPersonalizationAssets({
        id: uploadIdsInValues,
        owner_customer_id: input.customer_id,
        template_id: template.id,
        status: "uploaded",
      })
      for (const asset of assets) verifiedUploadIds.add(asset.id)
    }

    const validated = validatePersonalizationInput({
      template,
      fields: template.fields || [],
      submittedValues: input.values,
      verifiedUploadIds,
    })
    return new StepResponse({
      template_id: template.id,
      template_version: template.version,
      currency_code: currencyCode,
      base_price: basePrice,
      personalization_adjustment: validated.priceAdjustment,
      total: basePrice + validated.priceAdjustment,
      normalized_values: validated.normalizedValues,
    })
  }
)

/** A server-authoritative quote: clients never provide a price or surcharge. */
export const quotePersonalizedProductWorkflow = createWorkflow(
  "quote-personalized-product",
  (input: QuotePersonalizedProductInput) => new WorkflowResponse(quotePersonalizedProductStep(input))
)
