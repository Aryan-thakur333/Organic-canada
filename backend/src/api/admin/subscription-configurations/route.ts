import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"
import { SUBSCRIPTION_INTERVALS } from "../../../modules/subscription/contract"

const ConfigSchema = z.object({
  product_id: z.string().min(1),
  variant_id: z.string().min(1).optional().nullable(),
  enabled: z.boolean().default(false),
  allowed_intervals: z.array(z.enum(SUBSCRIPTION_INTERVALS)).min(1).max(4),
  minimum_periods: z.number().int().min(1).max(120).default(1),
  maximum_periods: z.number().int().min(1).max(120).optional().nullable(),
  discount_type: z.enum(["none", "percentage", "fixed"]).default("none"),
  discount_value: z.number().int().min(0).default(0),
  one_time_purchase_allowed: z.boolean().default(true),
  cancellation_policy: z.string().max(1000).optional().nullable(),
  pause_allowed: z.boolean().default(true),
  trial_period_days: z.number().int().min(0).max(365).default(0),
}).strict()

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  const configurations = await service.listSubscriptionProductConfigurations({}, { order: { created_at: "DESC" } })
  return res.json({ configurations, count: configurations.length })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = ConfigSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ code: "SUBSCRIPTION_CONFIG_INVALID", message: "Invalid subscription configuration.", issues: parsed.error.issues })
  if (parsed.data.maximum_periods && parsed.data.maximum_periods < parsed.data.minimum_periods) {
    return res.status(400).json({ code: "SUBSCRIPTION_CONFIG_INVALID", message: "maximum_periods must be greater than or equal to minimum_periods." })
  }
  if (parsed.data.discount_type === "percentage" && parsed.data.discount_value > 10000) {
    return res.status(400).json({ code: "SUBSCRIPTION_CONFIG_INVALID", message: "Percentage discount cannot exceed 100%." })
  }

  const productService: any = req.scope.resolve(Modules.PRODUCT)
  try {
    const product = await productService.retrieveProduct(parsed.data.product_id, { relations: ["variants"] })
    if (parsed.data.variant_id && !product.variants?.some((variant: any) => variant.id === parsed.data.variant_id)) {
      return res.status(400).json({ code: "SUBSCRIPTION_VARIANT_INVALID", message: "The variant does not belong to the product." })
    }
    const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const configuration = await service.createSubscriptionProductConfigurations({
      product_id_reference: parsed.data.product_id,
      variant_id_reference: parsed.data.variant_id || null,
      enabled: parsed.data.enabled,
      allowed_intervals: [...new Set(parsed.data.allowed_intervals)],
      minimum_periods: parsed.data.minimum_periods,
      maximum_periods: parsed.data.maximum_periods || null,
      discount_type: parsed.data.discount_type,
      discount_value: parsed.data.discount_value,
      one_time_purchase_allowed: parsed.data.one_time_purchase_allowed,
      cancellation_policy: parsed.data.cancellation_policy || null,
      pause_allowed: parsed.data.pause_allowed,
      trial_period_days: parsed.data.trial_period_days,
      metadata: { created_by: (req as any).auth_context?.actor_id || null },
    })
    return res.status(201).json({ configuration })
  } catch (error: any) {
    console.error(`[Subscription Config] create failed: ${error?.code || "SUBSCRIPTION_CONFIG_CREATE_FAILED"}`)
    return res.status(500).json({ code: "SUBSCRIPTION_CONFIG_CREATE_FAILED", message: "Unable to create subscription configuration." })
  }
}

