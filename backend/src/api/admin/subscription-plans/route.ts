import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"
import { normalizeSubscriptionPlan, planModelInput } from "../../../modules/subscription/plan-utils"

/**
 * GET /admin/subscription-plans
 * Lists all subscription plans with optional active filter.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const { active } = req.query

    const filters: any = {}
    if (active === "true") filters.is_active = true
    else if (active === "false") filters.is_active = false

    const plans = await subscriptionService.listSubscriptionPlans(filters, {
      order: { sort_order: "ASC" },
    })

    return res.json({ plans: plans.map(normalizeSubscriptionPlan) })
  } catch (error: any) {
    console.error("Error listing subscription plans:", error)
    return res.status(500).json({ message: error.message || "Failed to list plans" })
  }
}

/**
 * POST /admin/subscription-plans
 * Create a new subscription plan.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = req.body as any
    if (!(body.name || body.title) || !(body.price || body.amount)) {
      return res.status(400).json({ message: "name and price are required" })
    }

    const data = planModelInput(body)
    const validPlans = ["weekly", "monthly", "quarterly", "yearly"]
    if (!validPlans.includes(data.plan)) {
      return res.status(400).json({ message: `plan must be one of: ${validPlans.join(", ")}` })
    }

    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const newPlan = await subscriptionService.createSubscriptionPlans(data)

    return res.status(201).json({ plan: normalizeSubscriptionPlan(newPlan) })
  } catch (error: any) {
    console.error("Error creating subscription plan:", error)
    return res.status(500).json({ message: error.message || "Failed to create plan" })
  }
}
