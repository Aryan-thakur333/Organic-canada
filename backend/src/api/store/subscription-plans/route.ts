import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"
import { normalizeSubscriptionPlan } from "../../../modules/subscription/plan-utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  const plans = await service.listSubscriptionPlans({ is_active: true }, { order: { sort_order: "ASC" } })
  return res.json({ plans: plans.map(normalizeSubscriptionPlan) })
}
