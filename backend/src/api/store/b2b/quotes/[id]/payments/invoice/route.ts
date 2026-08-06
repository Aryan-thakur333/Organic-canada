import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  assertAcceptedPayableQuote,
  ensurePaymentCollectionForQuote,
  ensureOrderPaymentCollection,
  getPaymentQuote,
  markQuotePaymentState,
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
    const { reference, instructions } = (req.body || {}) as {
      reference?: string
      instructions?: string
    }
    const { quote, b2bService } = await getPaymentQuote(req, req.params.id, customerId)
    assertAcceptedPayableQuote(quote)
    const paymentCollection = await ensurePaymentCollectionForQuote(b2bService, quote)
    const orderPaymentCollection = await ensureOrderPaymentCollection(req.scope, {
      ...quote,
      payment_collection_id: paymentCollection.id,
    })

    const updated = await markQuotePaymentState(b2bService, quote, {
      payment_state: "awaiting_remittance",
      selected_payment_provider_id: "invoice",
      settlement_mode: "offline",
      payment_reference: reference || `B2B-${quote.id}`,
      metadata: {
        payment_collection_id: orderPaymentCollection?.id || paymentCollection.id,
        settlement_mode: "offline",
        payments: {
          ...(quote.metadata?.payments || {}),
          invoice: {
            reference: reference || `B2B-${quote.id}`,
            instructions:
              instructions ||
              "Please remit payment using the agreed B2B invoice terms. The order will be marked paid after remittance is confirmed.",
            requested_at: new Date().toISOString(),
          },
        },
      },
    })
    await updateQuoteOrderPaymentMetadata(req.scope.resolve(Modules.ORDER), quote, {
      payment_state: "awaiting_remittance",
      selected_payment_provider_id: "invoice",
      payment_reference: updated.metadata?.payments?.invoice?.reference,
    })

    return res.json({
      quote: quotePaymentSummary(updated),
      payment_state: updated.payment_state,
      provider_id: "invoice",
      reference: updated.metadata?.payments?.invoice?.reference,
      instructions: updated.metadata?.payments?.invoice?.instructions,
    })
  } catch (error: any) {
    return res.status(statusFromPaymentError(error)).json({
      message: error.message || "Failed to start invoice payment",
    })
  }
}
