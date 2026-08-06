import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../../modules/b2b"
import { getQuoteNegotiatedTotalMinor, normalizeMoneyToMinor } from "../../../../../utils/b2b/money"
import { markQuoteOrderPaymentCaptured } from "../../../../../utils/b2b/quote-payment"
import { hydrateAdminQuote, statusFromError } from "../../utils"

type MarkPaymentBody = {
  payment_reference?: string | null
  note?: string | null
  amount_received?: number | string | null
  received_at?: string | null
}

function quoteOrderId(quote: any) {
  return quote.order_id || quote.created_order_id || quote.metadata?.order_id || null
}

function parseReceivedAt(value?: string | null) {
  if (!value) {
    return new Date()
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    const error: any = new Error("received_at must be a valid date")
    error.status = 400
    throw error
  }

  return parsed
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const body = ((req as any).validatedBody || req.body || {}) as MarkPaymentBody

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const orderService: any = req.scope.resolve(Modules.ORDER)
    const quote = await b2bService.retrieveQuote(id)

    if (!quote) {
      return res.status(404).json({ message: "B2B quote not found" })
    }

    if (quote.status !== "accepted") {
      return res.status(400).json({ message: "Only accepted quotes can be marked paid." })
    }

    const receivedAt = parseReceivedAt(body.received_at)
    const receivedAtIso = receivedAt.toISOString()
    const orderId = quoteOrderId(quote)
    const paymentReference = String(body.payment_reference || "").trim() || null
    const note = String(body.note || "").trim() || null
    const amount = getQuoteNegotiatedTotalMinor(quote)
    const amountReceived =
      body.amount_received == null || String(body.amount_received).trim() === ""
        ? amount
        : normalizeMoneyToMinor(body.amount_received, "auto")

    if (amountReceived !== amount) {
      return res.status(400).json({ message: "amount_received must equal the negotiated quote total." })
    }

    if (orderId) {
      try {
        const paymentResult = await markQuoteOrderPaymentCaptured(req.scope, quote, {
          selected_payment_provider_id: "offline",
          payment_reference: paymentReference,
        })
        const order = await orderService.retrieveOrder(orderId)
        await orderService.updateOrders([
          {
            id: orderId,
            metadata: {
              ...(order?.metadata || {}),
              source: "b2b_quote",
              quote_id: quote.id,
              settlement_mode: "offline",
              payment_state: "paid",
              payment_reference: paymentReference,
              payment_received_at: receivedAtIso,
              offline_payment_note: note,
              paid_total: amountReceived,
              payment_collection_id: paymentResult?.payment_collection_id || quote.payment_collection_id || quote.metadata?.payment_collection_id || null,
            },
          },
        ])
      } catch (error) {
        console.warn("[Admin B2B Quotes] Unable to update order payment state:", error)
        throw error
      }
    }

    const updated = await b2bService.updateQuotes({
      id,
      payment_state: "paid",
      paid_at: receivedAt,
      selected_payment_provider_id: "offline",
      settlement_mode: "offline",
      payment_reference: paymentReference,
      metadata: {
        ...(quote.metadata || {}),
        settlement_mode: "offline",
        payment_state: "paid",
        payment_reference: paymentReference,
        payment_received_at: receivedAtIso,
        offline_payment: {
          ...(quote.metadata?.offline_payment || {}),
          provider: "offline",
          status: "paid",
          amount: amountReceived,
          currency_code: quote.currency_code || "cad",
          reference: paymentReference,
          note,
          received_at: receivedAtIso,
        },
      },
    })

    return res.json({
      message: "Payment marked received.",
      quote: await hydrateAdminQuote(req, updated),
    })
  } catch (error: any) {
    console.error("[Admin B2B Quotes] Mark payment received error:", error)
    return res.status(statusFromError(error)).json({
      message: error.message || "Failed to mark payment received",
    })
  }
}
