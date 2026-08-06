import { createOrderWorkflow } from "@medusajs/core-flows"
import { SUBSCRIPTION_MODULE } from "."

const SUPPORTED = new Set([
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
])

const STATUS_MAP: Record<string, string> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  paused: "paused",
  canceled: "cancelled",
  incomplete_expired: "expired",
}

function subscriptionIdFromInvoice(invoice: any): string | undefined {
  return invoice?.metadata?.subscription_id
    || invoice?.subscription_details?.metadata?.subscription_id
    || invoice?.parent?.subscription_details?.metadata?.subscription_id
}

function providerSubscriptionId(value: any): string | undefined {
  const candidate = value?.subscription
    || value?.subscription_details?.subscription
    || value?.parent?.subscription_details?.subscription
  return typeof candidate === "string" ? candidate : candidate?.id
}

export async function processStripeSubscriptionEvent(event: any, container: any): Promise<{ handled: boolean; duplicate?: boolean }> {
  if (!SUPPORTED.has(event.type)) return { handled: false }
  const service: any = container.resolve(SUBSCRIPTION_MODULE)

  const existingEvent = (await service.listSubscriptionProviderEvents({ provider: "stripe", provider_event_id: event.id }))[0]
  if (existingEvent?.status === "processed") return { handled: true, duplicate: true }

  let eventRecord = existingEvent
  if (!eventRecord) {
    try {
      eventRecord = await service.createSubscriptionProviderEvents({
        provider: "stripe",
        provider_event_id: event.id,
        event_type: event.type,
        status: "processing",
      })
    } catch {
      eventRecord = (await service.listSubscriptionProviderEvents({ provider: "stripe", provider_event_id: event.id }))[0]
      if (eventRecord) return { handled: true, duplicate: true }
      throw new Error("Unable to claim Stripe event")
    }
  }

  try {
    const object = event.data.object as any
    if (event.type === "checkout.session.completed") {
      const localId = object.metadata?.subscription_id
      if (!localId) throw new Error("SUBSCRIPTION_EVENT_METADATA_MISSING")
      const local = await service.retrieveSubscription(localId)
      await service.updateSubscriptions({
        id: localId,
        stripe_subscription_id: typeof object.subscription === "string" ? object.subscription : object.subscription?.id,
        stripe_customer_id: typeof object.customer === "string" ? object.customer : object.customer?.id,
        metadata: { ...(local.metadata || {}), checkout_completed_at: new Date().toISOString() },
      })
    }

    if (event.type === "invoice.paid") {
      const localId = subscriptionIdFromInvoice(object)
      if (!localId) throw new Error("SUBSCRIPTION_EVENT_METADATA_MISSING")
      const local = await service.retrieveSubscription(localId)
      const billingPeriodKey = String(object.id)
      let period = (await service.listSubscriptionBillingOrders({ subscription_id: localId, billing_period_key: billingPeriodKey }))[0]
      if (period?.order_id_reference) {
        await service.updateSubscriptionProviderEvents({ id: eventRecord.id, status: "processed", processed_at: new Date() })
        return { handled: true, duplicate: true }
      }
      if (!period) {
        try {
          period = await service.createSubscriptionBillingOrders({
            subscription_id: localId,
            billing_period_key: billingPeriodKey,
            provider_payment_reference: object.payment_intent || object.charge || object.id,
            status: "paid",
          })
        } catch {
          period = (await service.listSubscriptionBillingOrders({ subscription_id: localId, billing_period_key: billingPeriodKey }))[0]
          if (period?.order_id_reference) return { handled: true, duplicate: true }
          if (!period) throw new Error("SUBSCRIPTION_PERIOD_CLAIM_FAILED")
        }
      }

      const items = await service.listSubscriptionItems({ subscription_id: localId })
      if (!items.length) throw new Error("SUBSCRIPTION_ITEMS_MISSING")
      const { result: order }: any = await createOrderWorkflow(container).run({ input: {
        region_id: local.region_id_reference,
        customer_id: local.customer_id,
        email: local.customer_email,
        currency_code: local.currency,
        sales_channel_id: local.sales_channel_id_reference || undefined,
        shipping_address: local.shipping_address_snapshot || undefined,
        billing_address: local.billing_address_snapshot || local.shipping_address_snapshot || undefined,
        items: items.map((item: any) => ({
          title: item.title_snapshot,
          subtitle: item.variant_title_snapshot || undefined,
          variant_id: item.variant_id_reference,
          product_id: item.product_id_reference || undefined,
          quantity: item.quantity,
          unit_price: item.unit_price_snapshot,
          metadata: { subscription_id: localId, billing_period_key: billingPeriodKey },
        })),
        metadata: {
          subscription_id: localId,
          billing_period_key: billingPeriodKey,
          stripe_invoice_id: object.id,
          provider_payment_verified: true,
        },
      } as any })

      const periodEnd = object.period_end ? new Date(object.period_end * 1000) : null
      const periodStart = object.period_start ? new Date(object.period_start * 1000) : null
      await service.updateSubscriptionBillingOrders({ id: period.id, status: "order_created", order_id_reference: order.id })
      await service.updateSubscriptions({
        id: localId,
        status: "active",
        stripe_subscription_id: providerSubscriptionId(object) || local.stripe_subscription_id,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        next_billing_date: periodEnd,
        last_billed_at: new Date(),
        failed_payment_count: 0,
      })
    }

    if (event.type === "invoice.payment_failed") {
      const localId = subscriptionIdFromInvoice(object)
      if (!localId) throw new Error("SUBSCRIPTION_EVENT_METADATA_MISSING")
      const local = await service.retrieveSubscription(localId)
      await service.updateSubscriptions({
        id: localId,
        status: "past_due",
        failed_payment_count: Math.min(100, Number(local.failed_payment_count || 0) + 1),
        metadata: { ...(local.metadata || {}), last_payment_failure_at: new Date().toISOString() },
      })
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const localId = object.metadata?.subscription_id
      const local = localId
        ? await service.retrieveSubscription(localId)
        : (await service.listSubscriptions({ stripe_subscription_id: object.id }))[0]
      if (local) {
        const status = event.type === "customer.subscription.deleted" ? "cancelled" : (STATUS_MAP[object.status] || local.status)
        await service.updateSubscriptions({
          id: local.id,
          status,
          current_period_start: object.current_period_start ? new Date(object.current_period_start * 1000) : local.current_period_start,
          current_period_end: object.current_period_end ? new Date(object.current_period_end * 1000) : local.current_period_end,
          next_billing_date: object.current_period_end ? new Date(object.current_period_end * 1000) : local.next_billing_date,
          cancelled_at: status === "cancelled" ? new Date() : local.cancelled_at,
        })
      }
    }

    await service.updateSubscriptionProviderEvents({ id: eventRecord.id, status: "processed", processed_at: new Date(), error_code: null })
    return { handled: true }
  } catch (error: any) {
    await service.updateSubscriptionProviderEvents({ id: eventRecord.id, status: "failed", error_code: String(error?.message || "SUBSCRIPTION_EVENT_FAILED").slice(0, 128) })
    throw error
  }
}
