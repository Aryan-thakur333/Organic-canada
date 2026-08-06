import { getQuoteFinalPayableTotalMinor } from "./quote-commission"

export function getQuoteItemsTotalMinor(items: any[]) {
  return (items || []).reduce((sum, item) => {
    const qty = Number(item.quantity || 0)
    const unitPriceMinor = Number(item.unit_price || 0)
    return sum + unitPriceMinor * qty
  }, 0)
}

export function getQuotePayableTotalMinor(quote: any) {
  const finalPayable = getQuoteFinalPayableTotalMinor(quote)
  if (Number.isFinite(finalPayable) && finalPayable > 0) {
    return finalPayable
  }

  const itemsTotal = getQuoteItemsTotalMinor(quote.items || quote.metadata?.items || [])
  const adjustment = Number(quote.quote_adjustment_total || 0)

  if (Number.isFinite(Number(quote.negotiated_total)) && Number(quote.negotiated_total) > 0) {
    return Number(quote.negotiated_total)
  }

  return itemsTotal + adjustment
}

export function validatePayableTotal(quote: any) {
  const payable = getQuotePayableTotalMinor(quote)
  if (!Number.isFinite(payable) || payable <= 0) {
    throw new Error("Invalid B2B quote payable total")
  }
  return payable
}
