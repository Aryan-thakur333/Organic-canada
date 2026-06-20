import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"

export default async function subscriptionCancelledSubscriber({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; customer_email: string; reason?: string }>) {
  console.log(`[Subscription Cancelled Event] Subscription ${data.id} cancelled for customer ${data.customer_email}. Reason: ${data.reason || "User cancelled"}`)
  // Proactively send cancellation confirmation email here
}

export const config: SubscriberConfig = {
  event: "subscription.cancelled",
}
