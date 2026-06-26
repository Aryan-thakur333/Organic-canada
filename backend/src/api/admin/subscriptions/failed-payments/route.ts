import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../../modules/subscription"

/**
 * GET /admin/subscriptions/failed-payments
 * List subscriptions with failed payment attempts.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    // Fetch both past_due and expired subscriptions using array IN syntax
    const [pastDue, expired] = await Promise.all([
      subscriptionService.listSubscriptions(
        { status: "past_due" },
        { order: { created_at: "DESC" }, take: 200 }
      ),
      subscriptionService.listSubscriptions(
        { status: "expired" },
        { order: { created_at: "DESC" }, take: 200 }
      ),
    ])

    const subscriptions = [...pastDue, ...expired]

    const failedPayments = subscriptions
      .map((s: any) => ({
        id: s.id,
        customer_id: s.customer_id,
        customer_email: s.customer_email,
        product_title: s.product_title,
        plan: s.plan,
        amount: s.amount,
        currency: s.currency,
        status: s.status,
        failed_payment_count: s.failed_payment_count || 0,
        last_billed_at: s.last_billed_at,
        next_billing_date: s.next_billing_date,
        last_failure_reason: s.metadata?.last_failure_reason || null,
        last_failure_at: s.metadata?.last_failure_at || null,
        created_at: s.created_at,
      }))

    return res.json({
      failed_payments: failedPayments,
      count: failedPayments.length,
    })
  } catch (error: any) {
    console.error("Error listing failed payments:", error)
    return res.status(500).json({ message: error.message || "Failed to list failed payments" })
  }
}

/**
 * POST /admin/subscriptions/failed-payments
 * Retry a failed payment for a subscription.
 * Body: { subscription_id: string }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { subscription_id } = req.body as any

  if (!subscription_id) {
    return res.status(400).json({ message: "subscription_id is required" })
  }

  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const subscription = await subscriptionService.retrieveSubscription(subscription_id)

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" })
    }

    // Reset to active, clear failure count, and advance billing date
    const planDays: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 }
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + (planDays[subscription.plan] || 30))

    const updated = await subscriptionService.updateSubscriptions({
      id: subscription_id,
      status: "active",
      failed_payment_count: 0,
      next_billing_date: nextDate,
      last_billed_at: new Date(),
      metadata: {
        ...(subscription.metadata || {}),
        retried_at: new Date().toISOString(),
        last_failure_reason: null,
        last_failure_at: null,
      },
    })

    console.log(`[Admin] Retried payment for subscription ${subscription_id}, reset to active`)

    return res.json({
      message: "Payment retry initiated. Subscription reactivated.",
      subscription: updated,
    })
  } catch (error: any) {
    console.error("Error retrying payment:", error)
    return res.status(500).json({ message: error.message || "Failed to retry payment" })
  }
}
