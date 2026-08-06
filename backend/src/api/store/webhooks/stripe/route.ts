import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../../../modules/subscription/index"
import { B2B_MODULE } from "../../../../modules/b2b/index"
import { getStripeClient } from "../../../../lib/stripe-client"
import { updateQuoteOrderPaymentMetadata } from "../../../../utils/b2b/quote-payment"
import { processStripeSubscriptionEvent } from "../../../../modules/subscription/stripe-event-processor"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.warn("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured.")
    return res.status(400).json({ message: "Stripe webhook secret is not configured" })
  }
  if (webhookSecret.startsWith("sk_") || webhookSecret.startsWith("rk_")) {
    console.error("[Stripe Webhook] Invalid configuration: STRIPE_WEBHOOK_SECRET cannot be an API key.")
    return res.status(400).json({ message: "Invalid webhook secret configuration" })
  }

  const sig = req.headers["stripe-signature"] as string | undefined
  if (!sig) {
    console.warn("[Stripe Webhook] Missing stripe-signature header.")
    return res.status(400).json({ message: "Missing Stripe-Signature header" })
  }

  let event: any
  try {
    const rawBody = (req as any).rawBody ?? (typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body))
    event = getStripeClient().webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message)
    return res.status(400).json({ message: `Webhook Error: Stripe webhook signature verification failed: ${err.message}` })
  }

  const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER)
  const b2bService: any = req.scope.resolve(B2B_MODULE)

  try {
    const subscriptionResult = await processStripeSubscriptionEvent(event, req.scope)
    if (subscriptionResult.handled) {
      return res.json({ received: true, type: event.type, duplicate: subscriptionResult.duplicate === true })
    }
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
        if (pi.metadata?.source === "b2b_quote" && pi.metadata?.quote_id) {
          const quote = await b2bService.retrieveQuote(pi.metadata.quote_id)
          await b2bService.updateQuotes({
            id: pi.metadata.quote_id,
            payment_state: "paid",
            selected_payment_provider_id: "stripe",
            paid_at: new Date(),
            metadata: {
              ...(quote?.metadata || {}),
              payment_state: "paid",
              selected_payment_provider_id: "stripe",
              payments: {
                ...(quote?.metadata?.payments || {}),
                stripe: {
                  ...(quote?.metadata?.payments?.stripe || {}),
                  payment_intent_id: pi.id,
                  amount: pi.amount_received || pi.amount,
                  currency_code: pi.currency,
                  status: pi.status,
                  paid_at: new Date().toISOString(),
                },
              },
            },
          })
          await updateQuoteOrderPaymentMetadata(req.scope.resolve(Modules.ORDER), quote, {
            payment_state: "paid",
            selected_payment_provider_id: "stripe",
            payment_reference: pi.id,
            paid_at: new Date().toISOString(),
          })
        }
        break
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as any
        console.error("[Stripe Webhook] Payment failed:", pi.id)
        if (pi.metadata?.source === "b2b_quote" && pi.metadata?.quote_id) {
          const quote = await b2bService.retrieveQuote(pi.metadata.quote_id)
          await b2bService.updateQuotes({
            id: pi.metadata.quote_id,
            payment_state: "failed",
            selected_payment_provider_id: "stripe",
            metadata: {
              ...(quote?.metadata || {}),
              payment_state: "failed",
              selected_payment_provider_id: "stripe",
              payments: {
                ...(quote?.metadata?.payments || {}),
                stripe: {
                  ...(quote?.metadata?.payments?.stripe || {}),
                  payment_intent_id: pi.id,
                  amount: pi.amount,
                  currency_code: pi.currency,
                  status: pi.status,
                  failed_at: new Date().toISOString(),
                },
              },
            },
          })
          await updateQuoteOrderPaymentMetadata(req.scope.resolve(Modules.ORDER), quote, {
            payment_state: "failed",
            selected_payment_provider_id: "stripe",
            payment_reference: pi.id,
          })
        }
        break
      }

      case "charge.refunded": {
        const charge = event.data.object as any
        console.log("[Stripe Webhook] Charge refunded:", charge.id)
        // Refund processing belongs to the order/payment refund workflow.
        // A refund must not silently cancel or reactivate a subscription.
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
