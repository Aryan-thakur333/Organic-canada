import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createPayPalOrder, paypalConfigured } from "../../../../../../../../lib/paypal"
import {
  assertAcceptedPayableQuote,
  ensurePaymentCollectionForQuote,
  getPaymentQuote,
  markQuotePaymentState,
  quotePaymentSummary,
  statusFromPaymentError,
} from "../../../../../../../../utils/b2b/quote-payment"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    if (!paypalConfigured()) {
      return res.status(503).json({ message: "PayPal is not configured for quote payments" })
    }

    const { quote, b2bService } = await getPaymentQuote(req, req.params.id, customerId)
    assertAcceptedPayableQuote(quote)
    const paymentCollection = await ensurePaymentCollectionForQuote(b2bService, quote)
    const summary = quotePaymentSummary({ ...quote, payment_collection_id: paymentCollection.id })
    const existing = quote.metadata?.payments?.paypal

    let order = existing?.paypal_order_id &&
      Number(existing.amount) === summary.amount &&
      Number(existing.offer_version) === summary.offer_version
        ? { id: existing.paypal_order_id, status: existing.status || "CREATED" }
        : await createPayPalOrder({
            amount: summary.amount_decimal,
            currency_code: summary.currency_code,
            idempotency_key: `b2b-quote:${quote.id}:offer:${summary.offer_version}:paypal`,
            metadata: {
              quote_id: quote.id,
              invoice_id: `${quote.id}-${summary.offer_version}`,
            },
          })

    const updated = await markQuotePaymentState(b2bService, quote, {
      payment_state: "payment_required",
      selected_payment_provider_id: "paypal",
      settlement_mode: "online",
      payment_reference: order.id,
      metadata: {
        payment_collection_id: paymentCollection.id,
        settlement_mode: "online",
        payments: {
          ...(quote.metadata?.payments || {}),
          paypal: {
            paypal_order_id: order.id,
            amount: summary.amount,
            currency_code: summary.currency_code,
            offer_version: summary.offer_version,
            status: order.status,
          },
        },
      },
    })

    return res.json({
      quote: quotePaymentSummary(updated),
      provider_id: "paypal",
      paypal_order_id: order.id,
      status: order.status,
    })
  } catch (error: any) {
    return res.status(statusFromPaymentError(error)).json({
      message: error.message || "Failed to create PayPal order",
    })
  }
}
