import Stripe from "stripe"

let stripeClient: InstanceType<typeof Stripe> | undefined

/**
 * Construct Stripe only when a payment path is executed. Medusa imports
 * subscribers, jobs, and routes during boot, so creating the SDK at module
 * scope makes an optional development setting a fatal startup dependency.
 */
export function getStripeClient(): InstanceType<typeof Stripe> {
  if (stripeClient) {
    return stripeClient
  }

  const apiKey = process.env.STRIPE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("STRIPE_API_KEY is required for this payment operation")
  }

  stripeClient = new Stripe(apiKey, {
    apiVersion: "2025-05-28.basil" as any,
  })

  return stripeClient
}
