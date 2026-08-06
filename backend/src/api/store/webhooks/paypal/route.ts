import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../modules/b2b"
import { updateQuoteOrderPaymentMetadata } from "../../../../utils/b2b/quote-payment"

function extractQuoteId(resource: any) {
  return (
    resource?.purchase_units?.[0]?.custom_id ||
    resource?.supplementary_data?.related_ids?.order_id ||
    resource?.custom_id ||
    null
  )
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  const hasTransmissionHeaders = Boolean(
    req.headers["paypal-transmission-id"] &&
      req.headers["paypal-transmission-sig"] &&
      req.headers["paypal-cert-url"] &&
      req.headers["paypal-auth-algo"] &&
      req.headers["paypal-transmission-time"]
  )

  if (process.env.NODE_ENV === "production" && (!webhookId || !hasTransmissionHeaders)) {
    return res.status(400).json({ message: "A valid PayPal webhook configuration is required" })
  }

  try {
    const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body
    const resource = event?.resource || {}
    const quoteId = extractQuoteId(resource)

    if (!quoteId) {
      return res.json({ received: true, ignored: true, reason: "missing_quote_id" })
    }

    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const quote = await b2bService.retrieveQuote(quoteId)

    if (!quote) {
      return res.json({ received: true, ignored: true, reason: "quote_not_found" })
    }

    const completed =
      event.event_type === "CHECKOUT.ORDER.COMPLETED" ||
      event.event_type === "PAYMENT.CAPTURE.COMPLETED" ||
      resource.status === "COMPLETED"

    await b2bService.updateQuotes({
      id: quote.id,
      payment_state: completed ? "paid" : "processing",
      selected_payment_provider_id: "paypal",
      paid_at: completed ? new Date() : quote.paid_at || null,
      metadata: {
        ...(quote.metadata || {}),
        payment_state: completed ? "paid" : "processing",
        selected_payment_provider_id: "paypal",
        payments: {
          ...(quote.metadata?.payments || {}),
          paypal: {
            ...(quote.metadata?.payments?.paypal || {}),
            paypal_order_id: resource.id || quote.metadata?.payments?.paypal?.paypal_order_id || null,
            status: resource.status || event.event_type,
            webhook_event_type: event.event_type,
            webhook_synced_at: new Date().toISOString(),
          },
        },
      },
    })
    await updateQuoteOrderPaymentMetadata(req.scope.resolve(Modules.ORDER), quote, {
      payment_state: completed ? "paid" : "processing",
      selected_payment_provider_id: "paypal",
      payment_reference: resource.id || quote.metadata?.payments?.paypal?.paypal_order_id || null,
      paid_at: completed ? new Date().toISOString() : null,
    })

    return res.json({ received: true, type: event.event_type })
  } catch (error: any) {
    console.error("[PayPal Webhook] Handler error:", error)
    return res.status(500).json({ message: "PayPal webhook handler failed" })
  }
}
