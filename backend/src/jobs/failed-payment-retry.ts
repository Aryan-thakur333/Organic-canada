import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"
import { getStripeClient } from "../lib/stripe-client"

export default async function failedPaymentRetryJob(container: MedusaContainer) {
  const subscriptionService: any = container.resolve(SUBSCRIPTION_MODULE)
  const orderModuleService: any = container.resolve(Modules.ORDER)
  const eventBus: any = container.resolve(Modules.EVENT_BUS)

  try {
    const pastDueSubscriptions = await subscriptionService.listSubscriptions({ status: "past_due" })

    console.log(`[Failed Payment Retry Job] Found ${pastDueSubscriptions.length} past-due subscriptions`)

    const planDays: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 }

    for (const sub of pastDueSubscriptions) {
      if ((sub.failed_payment_count || 0) >= 3) {
        // Expire after 3 failed attempts
        await subscriptionService.updateSubscriptions({ id: sub.id, status: "expired" })
        console.log(`[Failed Payment Retry] Expired subscription ${sub.id} after 3 failures`)
        
        await eventBus.emit({
          name: "subscription.cancelled",
          data: { id: sub.id, customer_email: sub.customer_email, reason: "Payment failed 3 times" },
        })
        continue
      }

      try {
        if (!sub.stripe_customer_id || !sub.stripe_payment_method_id) {
          throw new Error("Missing Stripe Customer ID or Payment Method ID")
        }

        const nextAttempt = (sub.failed_payment_count || 0) + 1
        console.log(`[Failed Payment Retry] Retrying payment for subscription ${sub.id}, attempt ${nextAttempt}...`)

        // Charge Stripe off-session
        const pi = await getStripeClient().paymentIntents.create({
          amount: sub.amount,
          currency: sub.currency || "usd",
          customer: sub.stripe_customer_id,
          payment_method: sub.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          metadata: {
            subscription_id: sub.id,
            renewal: "true",
            retry_attempt: String(nextAttempt),
          },
        })

        if (pi.status !== "succeeded") {
          throw new Error(`Stripe payment failed with status: ${pi.status}`)
        }

        console.log(`[Failed Payment Retry] Payment retry succeeded for ${sub.id}`)

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
        console.log(`[Failed Payment Retry] Creating matching order in Medusa...`)
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

        console.log(`[Failed Payment Retry] Created order ${newOrder.id} for subscription ${sub.id}`)

        // Emit renewal success event
        await eventBus.emit({
          name: "subscription.renewed",
          data: { id: sub.id, order_id: newOrder.id, customer_email: sub.customer_email },
        })
      } catch (err: any) {
        const newFailCount = (sub.failed_payment_count || 0) + 1
        const newStatus = newFailCount >= 3 ? "expired" : "past_due"
        
        await subscriptionService.updateSubscriptions({
          id: sub.id,
          failed_payment_count: newFailCount,
          status: newStatus,
        })
        console.error(`[Failed Payment Retry] Retry attempt failed for ${sub.id}:`, err.message)

        if (newStatus === "expired") {
          await eventBus.emit({
            name: "subscription.cancelled",
            data: { id: sub.id, customer_email: sub.customer_email, reason: "Payment failed 3 times" },
          })
        } else {
          await eventBus.emit({
            name: "payment.failed",
            data: { id: sub.id, customer_email: sub.customer_email, error: err.message },
          })
        }
      }
    }
  } catch (error) {
    console.error("[Failed Payment Retry Job] Error:", error)
  }
}

export const config = {
  name: "failed-payment-retry",
  schedule: "0 12 */3 * *", // Every 3 days at noon
}
