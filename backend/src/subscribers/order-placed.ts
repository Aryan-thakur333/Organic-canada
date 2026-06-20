import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import Stripe from "stripe"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"

const stripe = new Stripe(process.env.STRIPE_API_KEY || "", {
  apiVersion: "2025-05-28.basil" as any,
})

export default async function orderPlacedSubscriptionCreator({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id
  console.log(`[OrderPlaced Subscriber] Processing order ${orderId}...`)

  const query = container.resolve("query")
  const remoteLink = container.resolve("remoteLink")
  const subscriptionService = container.resolve(SUBSCRIPTION_MODULE) as any
  const eventBus = container.resolve(Modules.EVENT_BUS) as any

  try {
    // 1. Fetch order details using Query Graph
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "email",
        "customer_id",
        "currency_code",
        "total",
        "region_id",
        "shipping_address.*",
        "billing_address.*",
        "items.*",
        "payment_collections.payments.id",
        "payment_collections.payments.provider_id",
        "payment_collections.payments.payment_session.data",
        "promotions.*",
      ],
      filters: { id: orderId },
    })

    const order = orders?.[0]
    if (!order) {
      console.warn(`[OrderPlaced Subscriber] Order ${orderId} not found`)
      return
    }

    console.log(`[OrderPlaced Subscriber] Checking items for subscriptions...`)
    
    // Find if there are subscription items
    const subscriptionItems = (order.items || []).filter((item: any) => {
      // Check metadata or product titles / handles
      return item.metadata?.is_subscription === true || 
             item.metadata?.subscription_plan !== undefined
    })

    if (subscriptionItems.length === 0) {
      console.log(`[OrderPlaced Subscriber] No subscription items in order ${orderId}`)
      return
    }

    // 2. Extract Stripe details if paid via Stripe
    let stripeCustomerId: string | null = null
    let stripePaymentMethodId: string | null = null
    let stripePaymentIntentId: string | null = null

    // Find stripe payment session
    const stripePayment = order.payment_collections?.[0]?.payments?.find(
      (p: any) => p.provider_id === "stripe"
    )

    const piId = stripePayment?.payment_session?.data?.id || stripePayment?.id

    if (piId && typeof piId === "string" && piId.startsWith("pi_")) {
      try {
        console.log(`[OrderPlaced Subscriber] Fetching payment intent ${piId} from Stripe...`)
        const pi = await stripe.paymentIntents.retrieve(piId)
        stripePaymentIntentId = pi.id
        stripeCustomerId = typeof pi.customer === "string" ? pi.customer : null
        stripePaymentMethodId = typeof pi.payment_method === "string" ? pi.payment_method : null
        
        if (stripePaymentMethodId) {
          if (!stripeCustomerId) {
            console.log(`[OrderPlaced Subscriber] No customer on Payment Intent. Finding/creating Stripe customer for ${order.email}...`)
            const existingCusts = await stripe.customers.list({ email: order.email as string, limit: 1 })
            if (existingCusts.data.length > 0) {
              stripeCustomerId = existingCusts.data[0].id
              console.log(`[OrderPlaced Subscriber] Found existing Stripe customer: ${stripeCustomerId}`)
            } else {
              const newCust = await stripe.customers.create({
                email: order.email as string,
                name: `${order.shipping_address?.first_name || ""} ${order.shipping_address?.last_name || ""}`.trim() || undefined,
                phone: order.shipping_address?.phone || undefined,
              })
              stripeCustomerId = newCust.id
              console.log(`[OrderPlaced Subscriber] Created new Stripe customer: ${stripeCustomerId}`)
            }
          }

          try {
            console.log(`[OrderPlaced Subscriber] Attaching payment method ${stripePaymentMethodId} to customer ${stripeCustomerId}...`)
            await stripe.paymentMethods.attach(stripePaymentMethodId, {
              customer: stripeCustomerId,
            })
            await stripe.customers.update(stripeCustomerId, {
              invoice_settings: {
                default_payment_method: stripePaymentMethodId,
              },
            })
          } catch (attachErr: any) {
            console.log(`[OrderPlaced Subscriber] Payment method attachment note:`, attachErr.message)
          }
        }
        
        console.log(`[OrderPlaced Subscriber] Stripe customer: ${stripeCustomerId}, payment_method: ${stripePaymentMethodId}`)
      } catch (err: any) {
        console.error(`[OrderPlaced Subscriber] Failed to fetch payment intent from Stripe:`, err.message)
      }
    }

    // 3. Create subscriptions
    const planDays: Record<string, number> = {
      weekly: 7,
      monthly: 30,
      quarterly: 90,
      yearly: 365,
    }

    for (const item of subscriptionItems) {
      const plan = (item?.metadata?.subscription_plan as string) || "monthly"
      const days = planDays[plan] || 30
      const nextBillingDate = new Date()
      nextBillingDate.setDate(nextBillingDate.getDate() + days)

      console.log(`[OrderPlaced Subscriber] Creating subscription for customer ${order.email}...`)
      const sub = await subscriptionService.createSubscriptions({
        customer_id: order.customer_id || "guest",
        customer_email: order.email,
        product_id: item?.product_id || null,
        product_title: item?.title,
        stripe_subscription_id: stripePaymentIntentId,
        stripe_customer_id: stripeCustomerId,
        stripe_payment_method_id: stripePaymentMethodId,
        plan,
        status: "active",
        amount: item?.unit_price, // store in cents
        currency: order.currency_code || "usd",
        next_billing_date: nextBillingDate,
        failed_payment_count: 0,
        metadata: {
          original_order_id: order.id,
          shipping_address: order.shipping_address,
          billing_address: order.billing_address,
          region_id: order.region_id,
          variant_id: item?.variant_id,
        },
      })

      console.log(`[OrderPlaced Subscriber] Subscription created successfully: ${sub.id}`)
      
      // Emit subscription.activated event
      await eventBus.emit({
        name: "subscription.activated",
        data: { id: sub.id, customer_email: sub.customer_email, plan: sub.plan },
      })
    }

    // --- VENDOR LINKAGE LOGIC ---
    console.log(`[OrderPlaced Subscriber] Linking vendors for order ${orderId}...`)
    const productIds = (order.items || []).map((item: any) => item?.product_id).filter(Boolean)
    
    if (productIds.length > 0) {
      const { data: productVendors } = await query.graph({
        entity: "product",
        fields: ["id", "vendor.*"],
        filters: { id: productIds },
      })

      const vendorIds = new Set<string>()
      for (const product of productVendors) {
        if (product.vendor && (product.vendor as any).id) {
          vendorIds.add((product.vendor as any).id)
        }
      }

      if (vendorIds.size > 0) {
        const links = Array.from(vendorIds).map(vendorId => ({
          [Modules.ORDER]: { order_id: orderId },
          "vendor": { vendor_id: vendorId },
        }))
        await remoteLink.create(links)
        console.log(`[OrderPlaced Subscriber] Successfully linked order ${orderId} to vendors:`, Array.from(vendorIds))
      } else {
        console.log(`[OrderPlaced Subscriber] No vendors found for products in order ${orderId}.`)
      }
    }
  } catch (error: any) {
    console.error(`[OrderPlaced Subscriber] Failed to process order:`, error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
