export const STATUS_GROUPS = {
  all: [
    "pending_merchant",
    "pending_review",
    "pending_customer",
    "accepted",
    "customer_rejected",
    "merchant_rejected",
    "expired",
    "converted",
    "converted_to_order",
  ],
  pending_review: ["pending_merchant", "pending_review"],
  offer_ready: ["pending_customer"],
  accepted: ["accepted"],
  rejected: ["customer_rejected", "merchant_rejected", "rejected"],
  expired: ["expired"],
  converted: ["converted", "converted_to_order"],
}

export const QUOTE_STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending_review", label: "Pending Review" },
  { value: "offer_ready", label: "Offer Ready" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
  { value: "converted", label: "Converted" },
]

export function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function getQuoteItems(quote) {
  const items =
    quote?.items ||
    quote?.line_items ||
    quote?.negotiated_items ||
    quote?.requested_items ||
    quote?.metadata?.items ||
    quote?.metadata?.quote_items ||
    quote?.draft_order?.items ||
    quote?.preview?.items ||
    []

  return Array.isArray(items) ? items : []
}

export function getQuoteCurrency(quote) {
  return (
    quote?.currency_code ||
    quote?.currencyCode ||
    quote?.preview?.currency_code ||
    quote?.draft_order?.currency_code ||
    "cad"
  )
}

export function getQuoteTotalMinor(quote) {
  const finalPayable =
    quote?.final_payable_total ??
    quote?.commission?.final_payable_total ??
    quote?.metadata?.final_payable_total ??
    quote?.metadata?.b2b_commission?.final_payable_total

  if (Number.isFinite(Number(finalPayable))) {
    return Number(finalPayable)
  }

  const items = getQuoteItems(quote)
  const direct =
    quote?.negotiated_total ??
    quote?.total ??
    quote?.preview?.total ??
    quote?.subtotal ??
    quote?.draft_order?.total ??
    quote?.metadata?.total ??
    quote?.metadata?.subtotal

  if (Number.isFinite(Number(direct))) {
    return Number(direct)
  }

  return items.reduce((sum, item) => {
    const qty = toNumber(item.quantity, 0)
    const lineTotal = item.total ?? item.line_total ?? item.subtotal

    if (Number.isFinite(Number(lineTotal))) {
      return sum + Number(lineTotal)
    }

    const unit =
      item.negotiated_unit_price ??
      item.unit_price ??
      item.unitPrice ??
      item.requested_unit_price ??
      item.price ??
      0

    return sum + toNumber(unit, 0) * qty
  }, 0)
}

export function getQuoteNegotiatedSubtotalMinor(quote) {
  const direct =
    quote?.negotiated_subtotal ??
    quote?.commission?.base_amount ??
    quote?.metadata?.negotiated_subtotal ??
    quote?.metadata?.b2b_commission?.base_amount ??
    quote?.negotiated_total ??
    quote?.preview?.subtotal

  if (Number.isFinite(Number(direct))) {
    return Number(direct)
  }

  return getQuoteTotalMinor(quote)
}

export function getQuoteCommissionAmountMinor(quote) {
  const direct =
    quote?.commission_amount ??
    quote?.commission?.amount ??
    quote?.metadata?.commission_amount ??
    quote?.metadata?.b2b_commission?.commission_amount

  return Number.isFinite(Number(direct)) ? Number(direct) : 0
}

export function getQuoteCommissionLabel(quote) {
  const type = quote?.commission_type ?? quote?.commission?.fee_type ?? quote?.metadata?.commission_type
  const value = quote?.commission_value ?? quote?.commission?.fee_value ?? quote?.metadata?.commission_value

  if (type === "percentage" && Number.isFinite(Number(value))) {
    return `B2B fee (${Number(value)}%)`
  }

  if (type === "fixed") {
    return "B2B fee"
  }

  return "B2B fee"
}

export function getQuoteOriginalTotalMinor(quote) {
  const direct =
    quote?.original_total ??
    quote?.requested_total ??
    quote?.preview?.original_subtotal ??
    quote?.subtotal ??
    quote?.metadata?.requested_total

  return Number.isFinite(Number(direct)) ? Number(direct) : 0
}

export function formatMinorCurrency(amountMinor, currencyCode = "cad") {
  const amount = toNumber(amountMinor, 0) / 100

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currencyCode || "cad").toUpperCase(),
  }).format(amount)
}

export function getQuoteItemCount(quote) {
  return toNumber(quote?.item_count ?? quote?.items_count, getQuoteItems(quote).length)
}

export function getQuoteTotalUnits(quote) {
  return toNumber(
    quote?.total_units,
    getQuoteItems(quote).reduce((sum, item) => sum + toNumber(item.quantity, 0), 0)
  )
}

export function getQuoteCompanyName(quote, currentCompany) {
  return (
    quote?.company?.name ||
    quote?.company?.company_name ||
    quote?.company_name ||
    quote?.metadata?.company_name ||
    currentCompany?.company_name ||
    currentCompany?.name ||
    "—"
  )
}

export function getQuoteCustomerEmail(quote, currentUser) {
  return (
    quote?.customer?.email ||
    quote?.customer_email ||
    quote?.email ||
    quote?.metadata?.customer_email ||
    currentUser?.email ||
    "—"
  )
}

export function getQuoteStatusLabel(status) {
  switch (status) {
    case "pending_merchant":
    case "pending_review":
      return "Pending Review"
    case "pending_customer":
      return "Offer Ready"
    case "accepted":
      return "Accepted"
    case "customer_rejected":
      return "Rejected by You"
    case "merchant_rejected":
      return "Rejected by Merchant"
    case "expired":
      return "Expired"
    case "converted":
    case "converted_to_order":
      return "Converted"
    case "rejected":
      return "Rejected"
    default:
      return status || "Unknown"
  }
}

export function getQuotePaymentStatusLabel(quote) {
  if (quote?.payment_state === "paid") return "Captured / Paid"
  if (quote?.payment_state === "awaiting_remittance") return "Awaiting Remittance"
  if (quote?.payment_state === "payment_required") return "Payment Required"
  if (quote?.status === "accepted") return "Accepted"
  return getQuoteStatusLabel(quote?.status)
}

export function quoteMatchesStatusGroup(quote, group) {
  if (!group) return true
  const statuses = STATUS_GROUPS[group] || [group]
  return statuses.includes(quote?.status)
}

export function shouldShowAdjustedTotal(quote) {
  const originalTotal = getQuoteOriginalTotalMinor(quote)
  const total = getQuoteTotalMinor(quote)
  return originalTotal > 0 && total > 0 && originalTotal !== total
}

export function getQuoteOrderId(quote) {
  return quote?.order_id || quote?.converted_order_id || quote?.created_order_id || quote?.order?.id || null
}

export function normalizeQuote(quote, { currentCompany, currentUser } = {}) {
  const items = getQuoteItems(quote)
  const currencyCode = getQuoteCurrency(quote)
  const total = getQuoteTotalMinor(quote)
  const negotiatedSubtotal = getQuoteNegotiatedSubtotalMinor(quote)
  const originalTotal = getQuoteOriginalTotalMinor(quote)

  return {
    ...quote,
    items,
    currency_code: currencyCode,
    item_count: getQuoteItemCount(quote),
    total_units: getQuoteTotalUnits(quote),
    total,
    negotiated_subtotal: negotiatedSubtotal,
    commission_amount: getQuoteCommissionAmountMinor(quote),
    final_payable_total: total,
    original_total: originalTotal,
    company_display_name: getQuoteCompanyName(quote, currentCompany),
    customer_display_email: getQuoteCustomerEmail(quote, currentUser),
    status_label: getQuotePaymentStatusLabel(quote),
    order_id: getQuoteOrderId(quote),
  }
}
