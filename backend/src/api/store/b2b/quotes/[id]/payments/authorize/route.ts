import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { getStripeClient } from "../../../../../../../lib/stripe"
import {
  getPaymentQuote,
  markQuotePaymentState,
  markQuoteOrderPaymentCaptured,
  quotePaymentSummary,
  statusFromPaymentError,
  updateQuoteOrderPaymentMetadata,
} from "../../../../../../../utils/b2b/quote-payment"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const { payment_intent_id } = (req.body || {}) as { payment_intent_id?: string }
    if (!payment_intent_id) {
      return res.status(400).json({ message: "payment_intent_id is required" })
    }

    const { quote, b2bService } = await getPaymentQuote(req, req.params.id, customerId)
    if (quote.payment_state === "paid") {
      return res.json({
        quote: quotePaymentSummary(quote),
        payment_state: "paid",
        payment_intent_id: quote.metadata?.payments?.stripe?.payment_intent_id || payment_intent_id,
        status: quote.metadata?.payments?.stripe?.status || "succeeded",
      })
    }

    const paymentIntent = await getStripeClient().paymentIntents.retrieve(payment_intent_id)
    const summary = quotePaymentSummary(quote)

    if (Number(paymentIntent.amount) !== summary.amount || paymentIntent.currency !== summary.currency_code) {
      return res.status(400).json({ message: "Payment amount does not match this quote" })
    }

    const paid = paymentIntent.status === "succeeded"
    const processing = paymentIntent.status === "processing" || paymentIntent.status === "requires_capture"

    const updated = await markQuotePaymentState(b2bService, quote, {
      payment_state: paid ? "paid" : processing ? "processing" : "payment_required",
      selected_payment_provider_id: "stripe",
      settlement_mode: "online",
      payment_reference: paymentIntent.id,
      paid_at: paid ? new Date() : quote.paid_at || null,
      metadata: {
        settlement_mode: "online",
        payments: {
          ...(quote.metadata?.payments || {}),
          stripe: {
            ...(quote.metadata?.payments?.stripe || {}),
            payment_intent_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency_code: paymentIntent.currency,
            status: paymentIntent.status,
            authorized_at: new Date().toISOString(),
          },
        },
      },
    })
    await updateQuoteOrderPaymentMetadata(req.scope.resolve(Modules.ORDER), quote, {
      payment_state: updated.payment_state,
      selected_payment_provider_id: "stripe",
      payment_reference: paymentIntent.id,
      paid_at: paid ? new Date().toISOString() : null,
    })
    if (paid) {
      await markQuoteOrderPaymentCaptured(req.scope, updated, {
        selected_payment_provider_id: "stripe",
        payment_reference: paymentIntent.id,
      })
    }

    return res.json({
      quote: quotePaymentSummary(updated),
      payment_state: updated.payment_state,
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
    })
  } catch (error: any) {
    return res.status(statusFromPaymentError(error)).json({
      message: error.message || "Failed to authorize quote payment",
    })
  }
}
