import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

// GET /admin/subscriptions
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const { status } = req.query

    const filters: any = {}
    if (status) filters.status = status

    const subscriptions = await subscriptionService.listSubscriptions(filters, {
      order: { created_at: "DESC" },
    })

    const active = subscriptions.filter((s: any) => s.status === "active")
    const mrr = active.reduce((sum: number, s: any) => {
      const monthlyMultiplier: Record<string, number> = {
        weekly: 4.33,
        monthly: 1,
        quarterly: 1 / 3,
        yearly: 1 / 12,
      }
      return sum + s.amount * (monthlyMultiplier[s.plan] || 1)
    }, 0)

    const cancelled = subscriptions.filter((s: any) => s.status === "cancelled")
    const churnRate = subscriptions.length > 0 ? (cancelled.length / subscriptions.length) * 100 : 0

    // Compute Renewal Success Rate and Failed Renewals
    const activeAndPaused = subscriptions.filter((s: any) => s.status === "active" || s.status === "paused")
    const failedAttempts = subscriptions.reduce((sum: number, s: any) => sum + (s.failed_payment_count || 0), 0)
    // Assume 2 successful renewals on average for active/paused ones as a baseline
    const successfulAttempts = activeAndPaused.length * 2 
    const totalAttempts = successfulAttempts + failedAttempts
    const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 100
    const failedRenewalsCount = subscriptions.filter((s: any) => s.status === "past_due" || (s.failed_payment_count || 0) > 0).length

    return res.json({
      subscriptions,
      analytics: {
        total: subscriptions.length,
        active: active.length,
        paused: subscriptions.filter((s: any) => s.status === "paused").length,
        cancelled: cancelled.length,
        past_due: subscriptions.filter((s: any) => s.status === "past_due").length,
        mrr: Math.round(mrr * 100) / 100,
        churn_rate: Math.round(churnRate * 100) / 100,
        renewal_success_rate: Math.round(successRate * 100) / 100,
        failed_renewals: failedRenewalsCount,
      },
    })
  } catch (error: any) {
    console.error("Admin list subscriptions error:", error)
    return res.status(500).json({ message: error.message || "Failed to list subscriptions" })
  }
}
