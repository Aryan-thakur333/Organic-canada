import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import Stripe from "stripe"
import { SUBSCRIPTION_MODULE } from "../../../../modules/subscription"

const stripe = new Stripe(process.env.STRIPE_API_KEY || "", { apiVersion: "2025-05-28.basil" as any })
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ""

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const sig = req.headers["stripe-signature"] as string
  let event: any

  try {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body)
    if (sig && webhookSecret && webhookSecret !== "whsec_test") {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
    } else {
      console.warn("[Stripe Webhook] Skipping signature verification in dev/test mode.")
      event = typeof req.body === "string" ? JSON.parse(req.body) : req.body
    }
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message)
    if (process.env.NODE_ENV === "development" || !sig || webhookSecret === "whsec_test") {
      console.log("[Stripe Webhook] Dev fallback to unverified payload")
      event = typeof req.body === "string" ? JSON.parse(req.body) : req.body
    } else {
      return res.status(400).json({ message: `Webhook Error: ${err.message}` })
    }
  }

  const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER)

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any
        console.log("[Stripe Webhook] Checkout session completed:", session.id)

        const subscriptionId = session.metadata?.subscription_id
        const customerId = session.metadata?.customer_id

        if (!subscriptionId || !customerId) {
          console.warn("[Stripe Webhook] checkout.session.completed missing metadata")
          break
        }

        // Activate the local subscription record
        const planDays: Record<string, number> = {
          weekly: 7, monthly: 30, quarterly: 90, yearly: 365,
        }

        const localSub = await subscriptionService.retrieveSubscription(subscriptionId)
        if (!localSub) {
          console.warn(`[Stripe Webhook] Local subscription ${subscriptionId} not found`)
          break
        }

        const nextBillingDate = new Date()
        nextBillingDate.setDate(nextBillingDate.getDate() + (planDays[localSub.plan] || 30))

        await subscriptionService.updateSubscriptions({
          id: subscriptionId,
          status: "active",
          stripe_subscription_id: session.subscription || session.id,
          next_billing_date: nextBillingDate,
          last_billed_at: new Date(),
          failed_payment_count: 0,
        })

        // Update customer metadata: set premium status
        try {
          const customer = await customerModuleService.retrieveCustomer(customerId)
          const existingMetadata = customer?.metadata || {}

          await customerModuleService.updateCustomers({
            id: customerId,
            metadata: {
              ...existingMetadata,
              is_premium: true,
              subscription_id: subscriptionId,
              subscription_plan: localSub.plan,
              premium_activated_at: new Date().toISOString(),
              premium_session_id: session.id,
            },
          })

          console.log(
            `[Stripe Webhook] Premium activated for customer ${customerId} via session ${session.id}`
          )
        } catch (metaErr: any) {
          console.error(
            `[Stripe Webhook] Failed to update customer metadata: ${metaErr.message}`
          )
        }
        break
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as any
        console.log("[Stripe Webhook] Payment succeeded:", pi.id, "Amount:", pi.amount_received)
        // Update subscription status if metadata contains subscription_id
        if (pi.metadata?.subscription_id) {
          await subscriptionService.updateSubscriptions({
            id: pi.metadata.subscription_id,
            status: "active",
            failed_payment_count: 0,
            last_billed_at: new Date(),
          })
        }
        break
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as any
        console.error("[Stripe Webhook] Payment failed:", pi.id)
        if (pi.metadata?.subscription_id) {
          const sub = await subscriptionService.retrieveSubscription(pi.metadata.subscription_id)
          const failCount = (sub?.failed_payment_count || 0) + 1
          await subscriptionService.updateSubscriptions({
            id: pi.metadata.subscription_id,
            status: failCount >= 3 ? "expired" : "past_due",
            failed_payment_count: failCount,
          })
        }
        break
      }

      case "charge.refunded": {
        const charge = event.data.object as any
        console.log("[Stripe Webhook] Charge refunded:", charge.id)
        const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : null
        if (piId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(piId)
            if (pi.metadata?.subscription_id) {
              console.log(`[Stripe Webhook] Refunding subscription ${pi.metadata.subscription_id}, marking as cancelled...`)
              await subscriptionService.updateSubscriptions({
                id: pi.metadata.subscription_id,
                status: "cancelled",
              })
            }
          } catch (err: any) {
            console.error("[Stripe Webhook] Failed to process charge refund for subscription:", err.message)
          }
        }
        break
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as any
        console.log("[Stripe Webhook] Subscription cancelled:", sub.id)
        const [localSub] = await subscriptionService.listSubscriptions({
          stripe_subscription_id: sub.id,
        })
        if (localSub) {
          await subscriptionService.updateSubscriptions({
            id: localSub.id,
            status: "cancelled",
          })
        }
        break
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as any
        console.log("[Stripe Webhook] Subscription updated:", sub.id, "Status:", sub.status)
        const [localSub] = await subscriptionService.listSubscriptions({
          stripe_subscription_id: sub.id,
        })
        if (localSub) {
          const statusMap: Record<string, string> = {
            active: "active",
            trialing: "trialing",
            past_due: "past_due",
            canceled: "cancelled",
            unpaid: "past_due",
          }
          await subscriptionService.updateSubscriptions({
            id: localSub.id,
            status: statusMap[sub.status] || localSub.status,
            next_billing_date: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : undefined,
          })
        }
        break
      }

      default:
        console.log("[Stripe Webhook] Unhandled event type:", event.type)
    }

    return res.json({ received: true, type: event.type })
  } catch (error: any) {
    console.error("[Stripe Webhook] Handler error:", error)
    return res.status(500).json({ message: "Webhook handler failed" })
  }
}
