import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * Retired legacy endpoint. It formerly accepted generic provider payloads and
 * duplicated Stripe event handling. All subscription payment events must use
 * the signed, idempotent /store/webhooks/stripe endpoint.
 */
export async function POST(_req: MedusaRequest, res: MedusaResponse) {
  return res.status(410).json({
    code: "SUBSCRIPTION_WEBHOOK_RETIRED",
    message: "Use the configured signed Stripe webhook endpoint.",
  })
}
