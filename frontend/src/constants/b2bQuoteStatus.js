export const B2B_QUOTE_STATUS = {
  PENDING_MERCHANT: "pending_merchant",
  PENDING_CUSTOMER: "pending_customer",
  ACCEPTED: "accepted",
  CUSTOMER_REJECTED: "customer_rejected",
  MERCHANT_REJECTED: "merchant_rejected",
}

export const B2B_QUOTE_LOCKED_STATUSES = new Set([
  B2B_QUOTE_STATUS.ACCEPTED,
  B2B_QUOTE_STATUS.CUSTOMER_REJECTED,
  B2B_QUOTE_STATUS.MERCHANT_REJECTED,
  "rejected",
])

export const canAcceptB2BQuote = (quote) =>
  quote?.status === B2B_QUOTE_STATUS.PENDING_CUSTOMER

export const canRejectB2BQuote = (quote) =>
  quote?.status === B2B_QUOTE_STATUS.PENDING_CUSTOMER

export const canWriteB2BQuoteMessage = (quote) =>
  quote && !B2B_QUOTE_LOCKED_STATUSES.has(quote.status)
