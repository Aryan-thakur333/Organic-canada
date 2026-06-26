import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, MedusaError } from "@medusajs/framework/utils"
import Stripe from "stripe"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"
import { addPlanPeriod, normalizeSubscriptionPlan } from "../../../modules/subscription/plan-utils"

// ── Constants ──────────────────────────────────────────────────────────────

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"
// ── Helpers ────────────────────────────────────────────────────────────────

function getStripe() {
  return new Stripe(process.env.STRIPE_API_KEY || "", {
    apiVersion: "2025-05-28.basil" as any,
  })
}

/**
 * Updates the Medusa customer's metadata to reflect premium membership status.
 * Merges with any existing metadata to avoid data loss.
 */
async function setCustomerPremiumStatus(
  container: any,
  customerId: string,
  isPremium: boolean,
  extraMetadata?: Record<string, any>
): Promise<void> {
  const customerModuleService: any = container.resolve(Modules.CUSTOMER)
  const customer = await customerModuleService.retrieveCustomer(customerId)
  const existingMetadata = customer?.metadata || {}

  await customerModuleService.updateCustomers({
    id: customerId,
    metadata: {
      ...existingMetadata,
      is_premium: isPremium,
      ...(extraMetadata || {}),
    },
  })
}

// ────────────────────────────────────────────────────────────────────────────
//  GET /store/subscriptions
//  ─ Verification endpoint called by the frontend after Stripe Checkout
//    redirects the user back to {FRONTEND_URL}/dashboard/subscriptions?
//    session_id=cs_test_xxx
//
//  Flow:
//    1. Extract session_id from query string
//    2. Retrieve the Stripe Checkout Session to verify payment status
//    3. If payment is complete, load the local subscription via metadata
//    4. Activate the subscription and set customer metadata: is_premium: true
//    5. Return the updated subscription + customer status to the frontend
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sessionId = req.query.session_id as string | undefined
  const authenticatedCustomerId = (req as any).auth_context?.actor_id as string | undefined

  if (!sessionId) {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const subscriptions = await subscriptionService.listSubscriptions(
      { customer_id: authenticatedCustomerId },
      { order: { created_at: "DESC" } }
    )
    return res.json({ subscriptions, count: subscriptions.length })
  }

  try {
    const stripe = getStripe()

    // 1. Retrieve the Stripe Checkout Session
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      return res.status(402).json({
        success: false,
        message: `Payment not completed. Status: ${session.payment_status}`,
        payment_status: session.payment_status,
      })
    }

    // 2. Extract the subscription and customer IDs from session metadata
    const subscriptionId = session.metadata?.subscription_id
    const customerId = session.metadata?.customer_id

    if (!subscriptionId || !customerId) {
      return res.status(400).json({
        success: false,
        message: "Session metadata missing subscription_id or customer_id",
      })
    }

    if (customerId !== authenticatedCustomerId) {
      return res.status(403).json({ success: false, message: "This checkout session belongs to another customer" })
    }

    // 3. Load and activate the local subscription record
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)

    const subscription = await subscriptionService.retrieveSubscription(subscriptionId)
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription record not found",
      })
    }

    // Calculate next billing date based on plan
    const nextBillingDate = addPlanPeriod(
      new Date(),
      subscription.metadata?.interval || (subscription.plan === "weekly" ? "week" : subscription.plan === "yearly" ? "year" : "month"),
      Number(subscription.metadata?.period || 1)
    )

    // Update local subscription to active with billing dates
    await subscriptionService.updateSubscriptions({
      id: subscriptionId,
      status: "active",
      stripe_subscription_id: session.subscription || sessionId,
      next_billing_date: nextBillingDate,
      last_billed_at: new Date(),
      failed_payment_count: 0,
    })

    // 4. Update customer metadata: set premium status
    await setCustomerPremiumStatus(req.scope, customerId, true, {
      subscription_id: subscriptionId,
      subscription_plan: subscription.plan,
      subscription_plan_id: subscription.metadata?.plan_id,
      fast_delivery: subscription.metadata?.fast_delivery === true,
      premium_activated_at: new Date().toISOString(),
      premium_session_id: sessionId,
    })

    console.log(
      `[Subscriptions] Premium activated for customer ${customerId} via session ${sessionId}`
    )

    // 5. Return success to the frontend
    return res.json({
      success: true,
      message: "Premium membership activated",
      customer: {
        id: customerId,
        metadata: {
          is_premium: true,
          subscription_id: subscriptionId,
        },
      },
    })
  } catch (error: any) {
    console.error("[Subscriptions] Session verification error:", error)

    // Handle Stripe-specific errors gracefully
    if (error.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        success: false,
        message: `Invalid Stripe session: ${error.message}`,
      })
    }

    if (error instanceof MedusaError) {
      const status = error.type === "not_found" ? 404 : 400
      return res.status(status).json({ success: false, message: error.message })
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to verify subscription payment",
    })
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  POST /store/subscriptions
//  ─ Create a new subscription and initialize the Stripe Checkout Session
//
//  Flow:
//    1. Validate auth and required inputs
//    2. Create a local subscription record with status "trialing"
//    3. Create a Stripe Checkout Session that redirects back to the frontend
//    4. Return the Checkout URL so the frontend can redirect the user
// ────────────────────────────────────────────────────────────────────────────
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customer_id = (req as any).auth_context?.actor_id
  const { product_id, plan_id, plan } = req.body as any

  if (!customer_id) {
    return res.status(401).json({ message: "Authentication required" })
  }
  if (!plan_id && !plan) {
    return res.status(400).json({ message: "plan_id is required" })
  }

  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const customerService: any = req.scope.resolve(Modules.CUSTOMER)
    const availablePlans = await subscriptionService.listSubscriptionPlans(
      plan_id ? { id: plan_id, is_active: true } : { plan, is_active: true },
      { order: { sort_order: "ASC" }, take: 1 }
    )
    const selectedPlan = availablePlans[0]
    if (!selectedPlan) return res.status(404).json({ message: "Active subscription plan not found" })
    const normalizedPlan = normalizeSubscriptionPlan(selectedPlan)
    const customer = await customerService.retrieveCustomer(customer_id)
    const nextBillingDate = addPlanPeriod(new Date(), normalizedPlan.interval, normalizedPlan.period)
    const customerSubscriptions = await subscriptionService.listSubscriptions({ customer_id })
    const existingActive = customerSubscriptions.find((item: any) =>
      ["active", "trialing"].includes(item.status) && item.metadata?.plan_id === selectedPlan.id
    )
    if (existingActive) return res.status(200).json({ subscription: existingActive, reused: true })

    const stripeKey = process.env.STRIPE_API_KEY
    if (!stripeKey || stripeKey === "sk_test_placeholder") {
      return res.status(503).json({ message: "Subscription checkout is unavailable because Stripe is not configured" })
    }

    // 1. Create local subscription record (pending until Stripe confirms)
    const subscription = await subscriptionService.createSubscriptions({
      customer_id,
      customer_email: customer.email,
      product_id: product_id || null,
      product_title: normalizedPlan.name,
      plan: selectedPlan.plan,
      amount: selectedPlan.amount,
      currency: selectedPlan.currency,
      status: "trialing",
      next_billing_date: nextBillingDate,
      failed_payment_count: 0,
      metadata: {
        plan_id: selectedPlan.id,
        plan_name: normalizedPlan.name,
        interval: normalizedPlan.interval,
        period: normalizedPlan.period,
        display: normalizedPlan.display,
        fast_delivery: normalizedPlan.metadata?.fast_delivery === true,
      },
    })

    // 2. Create Stripe Checkout Session with frontend return URLs
    if (stripeKey) {
      const stripe = getStripe()

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer_email: customer.email || undefined,
        line_items: [
          {
            price_data: {
              currency: selectedPlan.currency,
              product_data: {
                name: normalizedPlan.name,
                metadata: { subscription_id: subscription.id },
              },
              recurring: {
                interval: normalizedPlan.interval,
                interval_count: normalizedPlan.period,
              },
              unit_amount: selectedPlan.amount,
            },
            quantity: 1,
          },
        ],
        metadata: {
          subscription_id: subscription.id,
          customer_id,
        },
        // The frontend handles the redirect and calls GET /store/subscriptions?session_id=xxx
        success_url: `${FRONTEND_URL}/dashboard/subscriptions?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/dashboard/subscriptions?canceled=true`,
      })

      // Store the Stripe session reference
      await subscriptionService.updateSubscriptions({
        id: subscription.id,
        stripe_subscription_id: session.id,
      })

      return res.status(201).json({
        subscription,
        url: session.url,
        session_id: session.id,
      })
    }

    // 3. No Stripe key configured — mock mode for development
    //    Directly activate the subscription and set premium status.
    return res.status(503).json({ message: "Subscription checkout is unavailable" })
  } catch (error: any) {
    console.error("[Subscriptions] Create subscription error:", error)

    if (error instanceof MedusaError) {
      const status = error.type === "not_found" ? 404 : 400
      return res.status(status).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to create subscription" })
  }
}
