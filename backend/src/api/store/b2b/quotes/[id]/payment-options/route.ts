import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { paypalConfigured } from "../../../../../../lib/paypal"
import {
  getPaymentQuote,
  quotePaymentSummary,
  statusFromPaymentError,
} from "../../../../../../utils/b2b/quote-payment"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const { quote } = await getPaymentQuote(req, req.params.id, customerId)
    const summary = quotePaymentSummary(quote)

    if (quote.status !== "accepted") {
      return res.status(400).json({ message: "Quote must be accepted before payment options are available." })
    }

    return res.json({
      quote: summary,
      providers: [
        {
          id: "stripe",
          label: "Credit card",
          enabled: quote.payment_state !== "paid" && Boolean(process.env.STRIPE_API_KEY),
        },
        {
          id: "paypal",
          label: "PayPal",
          enabled: quote.payment_state !== "paid" && paypalConfigured(),
        },
        {
          id: "invoice",
          label: "Invoice / bank transfer",
          enabled: quote.payment_state !== "paid",
        },
      ],
    })
  } catch (error: any) {
    return res.status(statusFromPaymentError(error)).json({
      message: error.message || "Failed to load quote payment options",
    })
  }
}
