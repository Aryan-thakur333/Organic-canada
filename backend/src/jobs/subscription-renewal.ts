import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import Stripe from "stripe"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"

const stripe = new Stripe(process.env.STRIPE_API_KEY || "", {
  apiVersion: "2025-05-28.basil" as any,
})

export default async function subscriptionRenewalJob(container: MedusaContainer) {
  const subscriptionService: any = container.resolve(SUBSCRIPTION_MODULE)
  const orderModuleService: any = container.resolve(Modules.ORDER)
  const eventBus: any = container.resolve(Modules.EVENT_BUS)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  try {
    // Find active subscriptions due for renewal today (or past due and needing billing)
    const subscriptions = await subscriptionService.listSubscriptions({ status: "active" })

    const dueToday = subscriptions.filter((sub: any) => {
      if (!sub.next_billing_date) return false
      const billingDate = new Date(sub.next_billing_date)
      billingDate.setHours(0, 0, 0, 0)
      return billingDate <= today
    })

    console.log(`[Subscription Renewal Job] Found ${dueToday.length} subscriptions due for renewal`)

    const planDays: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 }

    for (const sub of dueToday) {
      try {
        if (!sub.stripe_customer_id || !sub.stripe_payment_method_id) {
          throw new Error("Missing Stripe Customer ID or Payment Method ID")
        }

        console.log(`[Subscription Renewal Job] Renewing subscription ${sub.id} (Customer: ${sub.customer_email})`)
        console.log(`[Subscription Renewal Job] Charging Stripe customer ${sub.stripe_customer_id} off-session...`)

        // Charge Stripe off-session
        const pi = await stripe.paymentIntents.create({
          amount: sub.amount, // sub.amount is in cents
          currency: sub.currency || "usd",
          customer: sub.stripe_customer_id,
          payment_method: sub.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          metadata: {
            subscription_id: sub.id,
            renewal: "true",
          },
        })

        if (pi.status !== "succeeded") {
          throw new Error(`Stripe payment failed with status: ${pi.status}`)
        }

        console.log(`[Subscription Renewal Job] Stripe charge succeeded: ${pi.id}`)

        // Calculate new billing date
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + (planDays[sub.plan] || 30))

        // Update local subscription details
        await subscriptionService.updateSubscriptions({
          id: sub.id,
          next_billing_date: nextDate,
          last_billed_at: new Date(),
          failed_payment_count: 0,
          status: "active",
        })

        // Create corresponding order in Medusa
        console.log(`[Subscription Renewal Job] Creating matching order in Medusa...`)
        const origMeta = sub.metadata || {}
        
        const newOrder = await orderModuleService.createOrders({
          email: sub.customer_email,
          currency_code: sub.currency,
          region_id: origMeta.region_id,
          shipping_address: origMeta.shipping_address,
          billing_address: origMeta.billing_address,
          items: [
            {
              title: sub.product_title || "Organic Subscription Box Renewal",
              quantity: 1,
              unit_price: sub.amount,
              variant_id: origMeta.variant_id,
              product_id: sub.product_id,
              metadata: {
                subscription_id: sub.id,
                is_renewal: true,
              },
            },
          ],
          metadata: {
            subscription_id: sub.id,
            is_renewal: true,
            stripe_payment_intent_id: pi.id,
          },
        })

        console.log(`[Subscription Renewal Job] Created order ${newOrder.id} for subscription ${sub.id}`)

        // Emit renewal success event
        await eventBus.emit({
          name: "subscription.renewed",
          data: { id: sub.id, order_id: newOrder.id, customer_email: sub.customer_email },
        })
      } catch (err: any) {
        console.error(`[Subscription Renewal Job] Failed to renew subscription ${sub.id}:`, err.message)
        
        const newFailCount = (sub.failed_payment_count || 0) + 1
        const newStatus = newFailCount >= 3 ? "expired" : "past_due"
        
        await subscriptionService.updateSubscriptions({
          id: sub.id,
          status: newStatus,
          failed_payment_count: newFailCount,
        })

        // Emit failure event
        await eventBus.emit({
          name: "payment.failed",
          data: { id: sub.id, customer_email: sub.customer_email, error: err.message },
        })
      }
    }
  } catch (error) {
    console.error("[Subscription Renewal Job] Error running renewal loop:", error)
  }
}

export const config = {
  name: "subscription-renewal",
  schedule: "0 6 * * *", // Run daily at 6 AM
}
