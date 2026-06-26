import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../modules/vendor"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"
import { B2B_MODULE } from "../modules/b2b"
import { getStripeClient } from "../lib/stripe-client"
import { splitOrderWorkflow } from "../workflows/split-order-workflow"

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

    // ── B2B QUOTE LINKAGE ────────────────────────────────────────────────
    try {
      const { data: orderCartLinks } = await query.graph({
        entity: "order",
        fields: ["id", "cart.id"],
        filters: { id: orderId },
      })
      const cartId = orderCartLinks?.[0]?.cart?.id
      if (cartId) {
        const b2bService: any = container.resolve(B2B_MODULE)
        const [quotes] = await b2bService.listQuotes({ cart_id: cartId }, { take: 1 })
        const quote = quotes?.[0]
        if (quote) {
          console.log(`[OrderPlaced Subscriber] Found B2B quote ${quote.id} for cart ${cartId}. Linking to order ${orderId}...`)
          
          await b2bService.updateQuotes({
            id: quote.id,
            order_id: orderId,
            status: "converted_to_order",
          })
          
          await remoteLink.create({
            [Modules.ORDER]: { order_id: orderId },
            [B2B_MODULE]: { company_id: quote.company_id },
          })
          
          const orderService: any = container.resolve(Modules.ORDER)
          await orderService.updateOrders({
            id: orderId,
            metadata: {
              ...(order.metadata || {}),
              quote_id: quote.id,
              company_id: quote.company_id,
              is_wholesale: true,
            }
          })
          console.log(`[OrderPlaced Subscriber] Linked B2B Quote ${quote.id} and Company ${quote.company_id} to Order ${orderId}`)
        }
      }
    } catch (b2bLinkErr: any) {
      console.error(`[OrderPlaced Subscriber] Failed to process B2B quote/company linkage:`, b2bLinkErr.message)
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
        const pi = await getStripeClient().paymentIntents.retrieve(piId)
        stripePaymentIntentId = pi.id
        stripeCustomerId = typeof pi.customer === "string" ? pi.customer : null
        stripePaymentMethodId = typeof pi.payment_method === "string" ? pi.payment_method : null
        
        if (stripePaymentMethodId) {
          if (!stripeCustomerId) {
            console.log(`[OrderPlaced Subscriber] No customer on Payment Intent. Finding/creating Stripe customer for ${order.email}...`)
            const existingCusts = await getStripeClient().customers.list({ email: order.email as string, limit: 1 })
            if (existingCusts.data.length > 0) {
              stripeCustomerId = existingCusts.data[0].id
              console.log(`[OrderPlaced Subscriber] Found existing Stripe customer: ${stripeCustomerId}`)
            } else {
              const newCust = await getStripeClient().customers.create({
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
            await getStripeClient().paymentMethods.attach(stripePaymentMethodId, {
              customer: stripeCustomerId,
            })
            await getStripeClient().customers.update(stripeCustomerId, {
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
        fields: ["id", "metadata", "vendor.*"],
        filters: { id: productIds },
      })

      const vendorIds = new Set<string>()
      for (const product of productVendors) {
        if (product.vendor && (product.vendor as any).id) {
          vendorIds.add((product.vendor as any).id)
        } else if (product.metadata?.vendor_id) {
          vendorIds.add(String(product.metadata.vendor_id))
        }
      }

      if (vendorIds.size > 0) {
        const links = Array.from(vendorIds).map(vendorId => ({
          [Modules.ORDER]: { order_id: orderId },
          "vendor": { vendor_id: vendorId },
        }))
        for (const link of links) {
          try {
            await remoteLink.create(link)
          } catch (error: any) {
            if (!/already exists|duplicate|multiple links|Cannot create multiple links/i.test(String(error?.message || error))) {
              throw error
            }
          }
        }
        console.log(`[OrderPlaced Subscriber] Successfully linked order ${orderId} to vendors:`, Array.from(vendorIds))
      } else {
        console.log(`[OrderPlaced Subscriber] No vendors found for products in order ${orderId}.`)
      }
    }

    // ── MULTI-VENDOR SPLIT ────────────────────────────────────────────────
    // Run the split-order workflow to compute per-vendor buckets.
    // This resolves each item's owning vendor and groups them for downstream
    // use (fulfillment routing, vendor notifications, payout calculation).
    try {
      const rawItems = (order.items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id || "",
        title: item.title || "",
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        thumbnail: item.thumbnail || null,
      }))

      const { result: splitResult } = await splitOrderWorkflow(container).run({
        input: {
          orderId,
          currency_code: order.currency_code || "usd",
          items: rawItems,
        },
      })

      console.log(
        `[OrderPlaced Subscriber] Order ${orderId}: split into ${splitResult.vendor_count} vendor bucket(s), ` +
        `${splitResult.unlinked_items.length} unlinked item(s)`
      )

      // Persist the vendor split data into order metadata so vendor dashboards
      // can display per-vendor totals without re-querying the link graph.
      if (splitResult.vendor_count > 0) {
        const orderService: any = container.resolve(Modules.ORDER)

        const bucketSummary = splitResult.buckets.map((bucket) => ({
          vendor_id: bucket.vendor_id,
          item_count: bucket.item_count,
          total: bucket.total,
          currency_code: bucket.currency_code,
        }))

        await orderService.updateOrders({
          id: orderId,
          metadata: {
            ...(order.metadata || {}),
            vendor_split: {
              bucket_count: splitResult.vendor_count,
              buckets: bucketSummary,
              unlinked_items_count: splitResult.unlinked_items.length,
              computed_at: new Date().toISOString(),
            },
          },
        })

        console.log(
          `[OrderPlaced Subscriber] Persisted vendor split metadata for order ${orderId}:`,
          JSON.stringify(bucketSummary)
        )

        // ── INVENTORY DEDUCTION AUDIT ──────────────────────────────────────
        // For each vendor bucket, query the current inventory levels for the
        // ordered variants and create an audit entry recording the pending
        // stock deduction (order fulfillment).
        try {
          const vendorService: any = container.resolve(VENDOR_MODULE)
          const inventoryService: any = container.resolve(Modules.INVENTORY)

          // Build a lookup of line_item_id -> order item details
          const itemLookup = new Map(
            (order.items || []).map((item: any) => [item.id, item])
          )

          for (const bucket of splitResult.buckets) {
            const variantIds = bucket.items
              .map((bi: any) => itemLookup.get(bi.line_item_id)?.variant_id)
              .filter(Boolean)

            if (variantIds.length === 0) continue

            // Query inventory levels for these variants via the product graph
            const { data: variants } = await query.graph({
              entity: "variant",
              fields: [
                "id",
                "sku",
                "title",
                "product.title",
                "inventory_items.inventory_item_id",
                "inventory_items.inventory.location_levels.id",
                "inventory_items.inventory.location_levels.stocked_quantity",
                "inventory_items.inventory.location_levels.reserved_quantity",
              ],
              filters: { id: variantIds },
            })

            for (const variant of variants as any[]) {
              const invLinks = variant.inventory_items || []
              for (const link of invLinks) {
                const levels = link.inventory?.location_levels || []
                for (const level of levels) {
                  // Find the matching bucket item to get the ordered quantity
                  const bucketItem = bucket.items.find((bi: any) => {
                    const oi = itemLookup.get(bi.line_item_id)
                    return oi?.variant_id === variant.id
                  })
                  const orderedQty = bucketItem?.quantity || 0
                  if (orderedQty === 0) continue

                  const previousStock = level.stocked_quantity || 0
                  const newStock = previousStock - orderedQty

                  await vendorService.createInventoryAudits({
                    vendor_id: bucket.vendor_id,
                    variant_id: variant.id,
                    variant_title: variant.title || null,
                    product_title: variant.product?.title || null,
                    sku: variant.sku || null,
                    inventory_item_id: link.inventory_item_id || null,
                    level_id: level.id,
                    previous_stocked_quantity: previousStock,
                    new_stocked_quantity: Math.max(0, newStock),
                    previous_reserved_quantity: level.reserved_quantity || 0,
                    new_reserved_quantity: level.reserved_quantity || 0,
                    change_type: "order_fulfillment",
                    source: "system",
                    actor_id: orderId,
                    actor_type: "system",
                    notes: `Order ${orderId.slice(0, 8)} placed - ${orderedQty} unit(s) of ${variant.title || variant.product?.title || ""}`.trim(),
                  })

                  console.log(
                    `[OrderPlaced Subscriber] Audit: vendor=${bucket.vendor_id.slice(0, 8)}, ` +
                    `variant=${variant.id.slice(0, 8)}, stock=${previousStock} -> ${Math.max(0, newStock)}, ` +
                    `qty=${orderedQty}, order=${orderId.slice(0, 8)}`
                  )
                }
              }
            }
          }
        } catch (auditErr: any) {
          // Non-fatal: audit failure should not prevent order processing
          console.error(
            `[OrderPlaced Subscriber] Failed to create inventory deduction audit entries: ${auditErr.message}`
          )
        }
      }
    } catch (splitErr: any) {
      // Non-fatal: split workflow failure should not prevent order processing.
      // The split can be re-run on-demand from the admin dashboard.
      console.error(
        `[OrderPlaced Subscriber] Split-order workflow failed for ${orderId}: ${splitErr.message}`
      )
    }
  } catch (error: any) {
    console.error(`[OrderPlaced Subscriber] Failed to process order:`, error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
