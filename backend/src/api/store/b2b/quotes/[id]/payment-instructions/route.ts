import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../../../modules/b2b"
import {
  minorToDecimalString,
} from "../../../../../../utils/b2b/money"
import { getQuoteFinalPayableTotalMinor } from "../../../../../../utils/b2b/quote-commission"

function quoteOrderId(quote: any) {
  return quote.order_id || quote.created_order_id || quote.metadata?.order_id || null
}

function quoteReference(quote: any) {
  return (
    quote.metadata?.offline_payment?.reference ||
    quote.metadata?.payments?.invoice?.reference ||
    quote.metadata?.payment_reference ||
    `B2B-${String(quote.id || "").slice(-8).toUpperCase()}`
  )
}

function paymentInstructions(quote: any, reference: string) {
  const storedInstructions =
    quote.metadata?.offline_payment?.instructions ||
    quote.metadata?.payments?.invoice?.instructions

  if (typeof storedInstructions === "string" && storedInstructions.trim()) {
    return storedInstructions.includes(reference)
      ? storedInstructions
      : `${storedInstructions} Include reference ${reference}.`
  }

  return `Please remit payment using your agreed offline terms. Include reference ${reference}. Your order will be marked paid after admin confirmation.`
}

function statusFromError(error: any) {
  if (Number.isInteger(error?.status)) return error.status
  if (error?.type === "not_found") return 404
  return 400
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const quote = await b2bService.retrieveQuote(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    if (quote.customer_id !== customerId) {
      return res.status(403).json({ message: "Access denied: this quote does not belong to you" })
    }

    if (quote.status !== "accepted") {
      return res.status(400).json({ message: "Payment instructions are available after quote acceptance." })
    }

    const amount = getQuoteFinalPayableTotalMinor(quote)
    const currencyCode = String(quote.currency_code || "cad").toLowerCase()
    const reference = quoteReference(quote)

    return res.json({
      quote_id: quote.id,
      order_id: quoteOrderId(quote),
      payment_state: quote.payment_state || "awaiting_remittance",
      settlement_mode: "offline",
      amount,
      amount_decimal: minorToDecimalString(amount),
      currency_code: currencyCode,
      payment_terms: quote.payment_terms || quote.metadata?.payment_terms || "due_on_receipt",
      payment_due_date: quote.payment_due_date || quote.metadata?.payment_due_date || null,
      reference,
      instructions: paymentInstructions(quote, reference),
    })
  } catch (error: any) {
    console.error("[B2B Quotes] Payment instructions error:", error)
    return res.status(statusFromError(error)).json({
      message: error.message || "Failed to load payment instructions",
    })
  }
}
