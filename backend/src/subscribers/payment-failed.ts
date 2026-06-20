import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"

export default async function paymentFailedSubscriber({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; customer_email: string; error: string }>) {
  console.error(`[Payment Failed Event] Subscription ${data.id} renewal payment failed for customer ${data.customer_email}. Error: ${data.error}`)
  // Proactively send payment warning/retry email here
}

export const config: SubscriberConfig = {
  event: "payment.failed",
}
