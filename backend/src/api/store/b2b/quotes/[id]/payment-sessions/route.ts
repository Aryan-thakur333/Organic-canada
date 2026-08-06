import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getStripeClient } from "../../../../../../lib/stripe"
import {
  assertAcceptedPayableQuote,
  ensurePaymentCollectionForQuote,
  getPaymentQuote,
  markQuotePaymentState,
  quotePaymentSummary,
  statusFromPaymentError,
} from "../../../../../../utils/b2b/quote-payment"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const { quote, b2bService } = await getPaymentQuote(req, req.params.id, customerId)
    assertAcceptedPayableQuote(quote)

    if (!process.env.STRIPE_API_KEY) {
      return res.status(503).json({ message: "Stripe is not configured for quote payments" })
    }

    const paymentCollection = await ensurePaymentCollectionForQuote(b2bService, quote)
    const summary = quotePaymentSummary({
      ...quote,
      payment_collection_id: paymentCollection.id,
      metadata: { ...(quote.metadata || {}), payment_collection_id: paymentCollection.id },
    })
    const existing = quote.metadata?.payments?.stripe
    const stripe = getStripeClient()
    let paymentIntent: any

    if (
      existing?.payment_intent_id &&
      Number(existing.amount) === summary.amount &&
      String(existing.currency_code).toLowerCase() === summary.currency_code &&
      Number(existing.offer_version) === summary.offer_version
    ) {
      paymentIntent = await stripe.paymentIntents.retrieve(existing.payment_intent_id)
    } else {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: summary.amount,
          currency: summary.currency_code,
          automatic_payment_methods: { enabled: true },
          metadata: {
            source: "b2b_quote",
            quote_id: quote.id,
            customer_id: customerId,
            company_id: quote.company_id || "",
            offer_version: String(summary.offer_version),
            payment_collection_id: paymentCollection.id,
          },
        },
        {
          idempotencyKey: `b2b-quote:${quote.id}:offer:${summary.offer_version}:stripe`,
        }
      )
    }

    const updated = await markQuotePaymentState(b2bService, quote, {
      payment_state: "payment_required",
      selected_payment_provider_id: "stripe",
      metadata: {
        payment_collection_id: paymentCollection.id,
        payments: {
          ...(quote.metadata?.payments || {}),
          stripe: {
            payment_intent_id: paymentIntent.id,
            amount: summary.amount,
            currency_code: summary.currency_code,
            offer_version: summary.offer_version,
            status: paymentIntent.status,
          },
        },
      },
    })

    return res.json({
      quote: quotePaymentSummary(updated),
      provider_id: "stripe",
      payment_collection_id: paymentCollection.id,
      payment_intent_id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
    })
  } catch (error: any) {
    return res.status(statusFromPaymentError(error)).json({
      message: error.message || "Failed to create quote payment session",
    })
  }
}
