import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { SUBSCRIPTION_MODULE } from "../../../../modules/subscription"
import { SUBSCRIPTION_INTERVALS } from "../../../../modules/subscription/contract"

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  allowed_intervals: z.array(z.enum(SUBSCRIPTION_INTERVALS)).min(1).max(4).optional(),
  minimum_periods: z.number().int().min(1).max(120).optional(),
  maximum_periods: z.number().int().min(1).max(120).nullable().optional(),
  discount_type: z.enum(["none", "percentage", "fixed"]).optional(),
  discount_value: z.number().int().min(0).optional(),
  one_time_purchase_allowed: z.boolean().optional(),
  cancellation_policy: z.string().max(1000).nullable().optional(),
  pause_allowed: z.boolean().optional(),
  trial_period_days: z.number().int().min(0).max(365).optional(),
}).strict()

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const parsed = UpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ code: "SUBSCRIPTION_CONFIG_INVALID", message: "Invalid subscription configuration." })
  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  const current = await service.retrieveSubscriptionProductConfiguration(req.params.id)
  const minimum = parsed.data.minimum_periods ?? current.minimum_periods
  const maximum = parsed.data.maximum_periods === undefined ? current.maximum_periods : parsed.data.maximum_periods
  if (maximum && maximum < minimum) return res.status(400).json({ code: "SUBSCRIPTION_CONFIG_INVALID", message: "maximum_periods must be greater than or equal to minimum_periods." })
  const type = parsed.data.discount_type ?? current.discount_type
  const value = parsed.data.discount_value ?? current.discount_value
  if (type === "percentage" && value > 10000) return res.status(400).json({ code: "SUBSCRIPTION_CONFIG_INVALID", message: "Percentage discount cannot exceed 100%." })
  const configuration = await service.updateSubscriptionProductConfigurations({
    id: current.id,
    ...parsed.data,
    allowed_intervals: parsed.data.allowed_intervals ? [...new Set(parsed.data.allowed_intervals)] : undefined,
    metadata: { ...(current.metadata || {}), updated_by: (req as any).auth_context?.actor_id || null, updated_at: new Date().toISOString() },
  })
  return res.json({ configuration })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  const current = await service.retrieveSubscriptionProductConfiguration(req.params.id)
  const configuration = await service.updateSubscriptionProductConfigurations({
    id: current.id,
    enabled: false,
    metadata: { ...(current.metadata || {}), archived_by: (req as any).auth_context?.actor_id || null, archived_at: new Date().toISOString() },
  })
  return res.json({ configuration, archived: true })
}

