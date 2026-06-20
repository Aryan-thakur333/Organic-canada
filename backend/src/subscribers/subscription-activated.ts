import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"

export default async function subscriptionActivatedSubscriber({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; customer_email: string; plan: string }>) {
  console.log(`[Subscription Activated Event] Subscriber ${data.id} activated for customer ${data.customer_email} on plan ${data.plan}.`)
  // Proactively send confirmation email or notification here
}

export const config: SubscriberConfig = {
  event: "subscription.activated",
}
