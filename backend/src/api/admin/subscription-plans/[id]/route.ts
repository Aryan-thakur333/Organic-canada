import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../../modules/subscription"
import { normalizeSubscriptionPlan, planModelInput } from "../../../../modules/subscription/plan-utils"

/**
 * GET /admin/subscription-plans/:id
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const plan = await subscriptionService.retrieveSubscriptionPlan(id)
    if (!plan) return res.status(404).json({ message: "Plan not found" })
    return res.json({ plan: normalizeSubscriptionPlan(plan) })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to retrieve plan" })
  }
}

/**
 * PUT /admin/subscription-plans/:id
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const existing = await subscriptionService.retrieveSubscriptionPlan(id)
    if (!existing) return res.status(404).json({ message: "Plan not found" })

    const merged = planModelInput({ ...existing, ...(req.body as any), metadata: { ...(existing.metadata || {}), ...((req.body as any).metadata || {}) } })
    const updateData: any = merged

    const updated = await subscriptionService.updateSubscriptionPlans({ id, ...updateData })
    return res.json({ plan: normalizeSubscriptionPlan(updated) })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to update plan" })
  }
}

export const PUT = PATCH

/**
 * DELETE /admin/subscription-plans/:id
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const existing = await subscriptionService.retrieveSubscriptionPlan(id)
    if (!existing) return res.status(404).json({ message: "Plan not found" })

    await subscriptionService.deleteSubscriptionPlans(id)
    return res.json({ message: "Plan deleted successfully", id })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to delete plan" })
  }
}
