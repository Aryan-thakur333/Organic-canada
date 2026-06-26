import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../../../modules/subscription"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const customer_id = (req as any).auth_context?.actor_id

  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const subscription = await subscriptionService.retrieveSubscription(id)
    if (!subscription) return res.status(404).json({ message: "Subscription not found" })
    if (subscription.customer_id !== customer_id) return res.status(403).json({ message: "Forbidden" })
    if (subscription.status !== "paused") {
      return res.status(400).json({ message: "Only paused subscriptions can be resumed" })
    }

    const planDays: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 }
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + (planDays[subscription.plan] || 30))

    const updated = await subscriptionService.updateSubscriptions({
      id,
      status: "active",
      next_billing_date: nextDate,
    })
    return res.json({ subscription: updated })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to resume subscription" })
  }
}
