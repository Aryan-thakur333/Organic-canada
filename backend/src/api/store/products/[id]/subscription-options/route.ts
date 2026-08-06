import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../../../modules/subscription"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = String(req.params.id || "").trim()
  const variantId = typeof req.query.variant_id === "string" ? req.query.variant_id.trim() : ""
  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  const configurations = await service.listSubscriptionProductConfigurations({ enabled: true, product_id_reference: productId })
  const config = configurations.find((entry: any) => variantId && entry.variant_id_reference === variantId)
    || configurations.find((entry: any) => !entry.variant_id_reference)
  if (!config) return res.status(404).json({ code: "SUBSCRIPTION_NOT_ELIGIBLE", message: "Subscription purchase is not available for this product." })
  return res.json({
    subscription: {
      enabled: true,
      allowed_intervals: config.allowed_intervals,
      minimum_periods: config.minimum_periods,
      maximum_periods: config.maximum_periods,
      discount_type: config.discount_type,
      discount_value: config.discount_value,
      one_time_purchase_allowed: config.one_time_purchase_allowed,
      cancellation_policy: config.cancellation_policy,
      pause_allowed: config.pause_allowed,
      trial_period_days: config.trial_period_days,
    },
  })
}

