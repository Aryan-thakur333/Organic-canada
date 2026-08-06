import { ExecArgs } from "@medusajs/framework/types"
import { B2B_MODULE } from "../modules/b2b/index.js"
import {
  getQuoteNegotiatedTotalMinor,
  getQuoteOriginalTotalMinor,
  quoteAdjustmentTotalMinor,
  storedMinor,
} from "../utils/b2b/money.js"

function metadataSettlementMode(quote: any): string | null {
  const value =
    quote.settlement_mode ||
    quote.metadata?.settlement_mode ||
    quote.metadata?.payments?.invoice?.settlement_mode ||
    quote.metadata?.offline_payment?.settlement_mode ||
    null

  return typeof value === "string" && value.trim() ? value.trim() : null
}

function paymentReference(quote: any): string | null {
  const value =
    quote.payment_reference ||
    quote.metadata?.payment_reference ||
    quote.metadata?.payments?.invoice?.reference ||
    quote.metadata?.offline_payment?.reference ||
    null

  return typeof value === "string" && value.trim() ? value.trim() : null
}

function paymentState(quote: any, settlementMode: string | null): string | null {
  if (quote.payment_state && !(quote.status === "accepted" && quote.payment_state === "not_required")) {
    return quote.payment_state
  }

  if (quote.paid_at || quote.metadata?.payment_state === "paid" || quote.metadata?.offline_payment?.status === "paid") {
    return "paid"
  }

  if (quote.status === "accepted") {
    const provider = quote.selected_payment_provider_id || quote.metadata?.selected_payment_provider_id
    const offline =
      settlementMode === "offline" ||
      settlementMode === "invoice" ||
      provider === "invoice" ||
      provider === "offline" ||
      Boolean(quote.metadata?.offline_payment)

    return offline ? "awaiting_remittance" : "payment_required"
  }

  return quote.payment_state || "not_required"
}

export default async function backfillB2BQuoteMoney({ container }: ExecArgs) {
  console.log("[B2B_QUOTE_MONEY_BACKFILL_START]")

  const b2bService: any = container.resolve(B2B_MODULE)
  const [quotes] = await b2bService.listAndCountQuotes({}, { take: 10000 })
  let updatedCount = 0

  for (const quote of quotes || []) {
    const originalTotal = getQuoteOriginalTotalMinor(quote)
    const negotiatedTotal = getQuoteNegotiatedTotalMinor(quote)
    const settlementMode = metadataSettlementMode(quote)
    const currentPaymentState = paymentState(quote, settlementMode)
    const reference = paymentReference(quote)

    const patch: Record<string, any> = {
      id: quote.id,
      original_total: originalTotal,
      negotiated_total: quote.negotiated_total == null ? negotiatedTotal : storedMinor(quote.negotiated_total),
      quote_adjustment_total: quoteAdjustmentTotalMinor({
        ...quote,
        original_total: originalTotal,
        negotiated_total: negotiatedTotal,
      }),
      payment_state: currentPaymentState,
      offer_version: Math.max(1, storedMinor(quote.offer_version, 1)),
      settlement_mode: settlementMode,
      payment_reference: reference,
      metadata: {
        ...(quote.metadata || {}),
        original_total: originalTotal,
        negotiated_total: quote.negotiated_total == null ? negotiatedTotal : storedMinor(quote.negotiated_total),
        quote_adjustment_total: negotiatedTotal - originalTotal,
        ...(currentPaymentState ? { payment_state: currentPaymentState } : {}),
        ...(settlementMode ? { settlement_mode: settlementMode } : {}),
        ...(reference ? { payment_reference: reference } : {}),
      },
    }

    if (quote.payment_terms == null && quote.metadata?.payment_terms) {
      patch.payment_terms = quote.metadata.payment_terms
    }

    if (quote.payment_due_date == null && quote.metadata?.payment_due_date) {
      patch.payment_due_date = new Date(quote.metadata.payment_due_date)
    }

    await b2bService.updateQuotes(patch)
    updatedCount += 1
  }

  console.log(`[B2B_QUOTE_MONEY_BACKFILL_DONE] updated=${updatedCount}`)
}
