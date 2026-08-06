import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { quotePersonalizedProductWorkflow } from "../../../../workflows/quote-personalized-product"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { variant_id, region_id, values, upload_ids } = req.body as any
    if (!variant_id || !region_id || !values || typeof values !== "object" || Array.isArray(values)) {
      return res.status(400).json({ message: "variant_id, region_id, and values are required" })
    }
    const { result: quote } = await quotePersonalizedProductWorkflow(req.scope).run({ input: {
      variant_id, region_id, values, upload_ids,
      customer_id: (req as any).auth_context?.actor_id,
    } })
    return res.status(200).json({
      quote: {
        ...quote,
        // Kept for storefront clients released before the explicit minor-unit field.
        adjustment: quote.personalization_adjustment,
      },
    })
  } catch (error: any) {
    return res.status(422).json({ code: "PERSONALIZATION_QUOTE_INVALID", message: error.message || "Unable to quote personalization" })
  }
}
