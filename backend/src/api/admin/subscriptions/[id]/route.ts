import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../../modules/subscription"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const subscription = await subscriptionService.retrieveSubscription(id)
    if (!subscription) return res.status(404).json({ message: "Subscription not found" })
    return res.json({ subscription })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to retrieve subscription" })
  }
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { status } = req.body as any

  const allowed = ["active", "paused", "cancelled", "past_due", "expired"]
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: `Invalid status. Allowed: ${allowed.join(", ")}` })
  }

  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const updates: any = { id, status }

    if (status === "active") {
      const existing = await subscriptionService.retrieveSubscription(id)
      const planDays: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 }
      const nextBillingDate = new Date()
      nextBillingDate.setDate(nextBillingDate.getDate() + (planDays[existing.plan] || 30))
      updates.next_billing_date = nextBillingDate
    }

    const subscription = await subscriptionService.updateSubscriptions(updates)
    return res.json({ subscription })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to update subscription" })
  }
}
