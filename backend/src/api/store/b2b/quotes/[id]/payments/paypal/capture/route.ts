import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { capturePayPalOrder } from "../../../../../../../../lib/paypal"
import {
  getPaymentQuote,
  markQuotePaymentState,
  markQuoteOrderPaymentCaptured,
  quotePaymentSummary,
  statusFromPaymentError,
  updateQuoteOrderPaymentMetadata,
} from "../../../../../../../../utils/b2b/quote-payment"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const { paypal_order_id } = (req.body || {}) as { paypal_order_id?: string }
    if (!paypal_order_id) {
      return res.status(400).json({ message: "paypal_order_id is required" })
    }

    const { quote, b2bService } = await getPaymentQuote(req, req.params.id, customerId)
    if (quote.payment_state === "paid") {
      return res.json({
        quote: quotePaymentSummary(quote),
        payment_state: "paid",
        status: quote.metadata?.payments?.paypal?.status || "COMPLETED",
      })
    }

    const summary = quotePaymentSummary(quote)
    const storedPayPal = quote.metadata?.payments?.paypal
    if (storedPayPal?.paypal_order_id && storedPayPal.paypal_order_id !== paypal_order_id) {
      return res.status(400).json({ message: "PayPal order does not match this quote" })
    }
    if (storedPayPal?.amount != null && Number(storedPayPal.amount) !== summary.amount) {
      return res.status(400).json({ message: "PayPal amount does not match this quote" })
    }

    const capture = await capturePayPalOrder(paypal_order_id)
    const paid = capture.status === "COMPLETED"
    const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || paypal_order_id

    const updated = await markQuotePaymentState(b2bService, quote, {
      payment_state: paid ? "paid" : "processing",
      selected_payment_provider_id: "paypal",
      settlement_mode: "online",
      payment_reference: captureId,
      paid_at: paid ? new Date() : quote.paid_at || null,
      metadata: {
        settlement_mode: "online",
        payments: {
          ...(quote.metadata?.payments || {}),
          paypal: {
            ...(quote.metadata?.payments?.paypal || {}),
            paypal_order_id,
            status: capture.status,
            capture_id: capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || null,
            captured_at: new Date().toISOString(),
          },
        },
      },
    })
    await updateQuoteOrderPaymentMetadata(req.scope.resolve(Modules.ORDER), quote, {
      payment_state: updated.payment_state,
      selected_payment_provider_id: "paypal",
      payment_reference: captureId,
      paid_at: paid ? new Date().toISOString() : null,
    })
    if (paid) {
      await markQuoteOrderPaymentCaptured(req.scope, updated, {
        selected_payment_provider_id: "paypal",
        payment_reference: captureId,
      })
    }

    return res.json({
      quote: quotePaymentSummary(updated),
      payment_state: updated.payment_state,
      status: capture.status,
    })
  } catch (error: any) {
    return res.status(statusFromPaymentError(error)).json({
      message: error.message || "Failed to capture PayPal payment",
    })
  }
}
