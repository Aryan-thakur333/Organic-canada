import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"

export default async function subscriptionRenewedSubscriber({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; order_id: string; customer_email: string }>) {
  console.log(`[Subscription Renewed Event] Subscription ${data.id} renewed successfully. Order ${data.order_id} created for customer ${data.customer_email}.`)
  // Proactively send renewal receipt email here
}

export const config: SubscriberConfig = {
  event: "subscription.renewed",
}
