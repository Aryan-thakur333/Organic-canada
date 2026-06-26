import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../../../modules/subscription"
import { Modules } from "@medusajs/framework/utils"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const customer_id = (req as any).auth_context?.actor_id

  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const eventBus: any = req.scope.resolve(Modules.EVENT_BUS)
    const subscription = await subscriptionService.retrieveSubscription(id)
    if (!subscription) return res.status(404).json({ message: "Subscription not found" })
    if (subscription.customer_id !== customer_id) return res.status(403).json({ message: "Forbidden" })
    if (subscription.status !== "past_due") {
      return res.status(400).json({ message: "Only past-due subscriptions can be retried" })
    }

    const planDays: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 }
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + (planDays[subscription.plan] || 30))

    const updated = await subscriptionService.updateSubscriptions({
      id,
      status: "active",
      failed_payment_count: 0,
      next_billing_date: nextDate,
      last_billed_at: new Date(),
      metadata: {
        ...(subscription.metadata || {}),
        retried_by_customer: true,
        retried_at: new Date().toISOString(),
        last_failure_reason: null,
        last_failure_at: null,
      },
    })

    // Restore premium status
    try {
      const customerService: any = req.scope.resolve(Modules.CUSTOMER)
      const customer = await customerService.retrieveCustomer(customer_id)
      await customerService.updateCustomers({
        id: customer_id,
        metadata: {
          ...(customer.metadata || {}),
          is_premium: true,
          premium_restored_at: new Date().toISOString(),
        },
      })
    } catch { /* non-critical */ }

    // Emit activation event
    try {
      await eventBus.emit({
        name: "subscription.activated",
        data: {
          id,
          customer_email: subscription.customer_email,
          plan: subscription.plan,
        },
      })
    } catch { /* non-critical */ }

    return res.json({ subscription: updated })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to retry subscription" })
  }
}
