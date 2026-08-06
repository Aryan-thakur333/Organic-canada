import { Modules } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../modules/b2b"
import {
  getQuoteNegotiatedTotalMinor,
  getQuoteOriginalTotalMinor,
  quoteAdjustmentTotalMinor,
  toFiniteNumber,
} from "../../../utils/b2b/money"
import {
  getQuoteFinalPayableTotalMinor,
  getQuoteNegotiatedSubtotalMinor,
  quoteCommissionResponseFields,
} from "../../../utils/b2b/quote-commission"

export const B2B_QUOTE_STATUSES = [
  "pending_merchant",
  "pending_customer",
  "accepted",
  "customer_rejected",
  "merchant_rejected",
]

export const PENDING_MERCHANT_STATUSES = ["pending_merchant", "pending_review"]
export const REJECTED_STATUSES = ["customer_rejected", "merchant_rejected", "rejected"]
export const LOCKED_QUOTE_STATUSES = ["accepted", ...REJECTED_STATUSES]

export function isPendingMerchantStatus(status?: string | null) {
  return PENDING_MERCHANT_STATUSES.includes(String(status || ""))
}

export function isPendingCustomerStatus(status?: string | null) {
  return status === "pending_customer"
}

export function isLockedQuoteStatus(status?: string | null) {
  return LOCKED_QUOTE_STATUSES.includes(String(status || ""))
}

export function normalizeMoney(value: any): number {
  return toFiniteNumber(value, 0)
}

export function getQuoteSourceItems(quote: any): any[] {
  if (Array.isArray(quote.negotiated_items) && quote.negotiated_items.length) {
    return quote.negotiated_items
  }

  if (Array.isArray(quote.requested_items) && quote.requested_items.length) {
    return quote.requested_items
  }

  if (Array.isArray(quote.items)) {
    return quote.items
  }

  return []
}

export function getQuoteItemId(item: any, index = 0) {
  return item.id || item.item_id || item.line_item_id || item.variant_id || `item-${index}`
}

export function normalizeQuoteItem(item: any, index = 0) {
  const quantity = normalizeMoney(item.quantity)
  const unitPrice = normalizeMoney(
    item.unit_price ??
      item.negotiated_unit_price ??
      item.requested_unit_price ??
      item.current_calculated_unit_price
  )
  const lineTotal = normalizeMoney(item.line_total ?? item.total ?? quantity * unitPrice)
  const metadata = item.metadata || {}

  return {
    ...item,
    id: getQuoteItemId(item, index),
    item_id: item.item_id || getQuoteItemId(item, index),
    product_id: item.product_id || null,
    variant_id: item.variant_id || null,
    title: item.title || item.product_title || item.name || "Quote item",
    sku: item.sku || item.variant_sku || null,
    quantity,
    original_unit_price: normalizeMoney(item.original_unit_price ?? metadata.original_unit_price ?? item.requested_unit_price ?? unitPrice),
    unit_price: unitPrice,
    requested_unit_price: normalizeMoney(item.requested_unit_price ?? metadata.original_unit_price ?? item.original_unit_price ?? unitPrice),
    negotiated_unit_price: normalizeMoney(item.negotiated_unit_price ?? unitPrice),
    current_calculated_unit_price: normalizeMoney(item.current_calculated_unit_price ?? unitPrice),
    line_total: lineTotal,
    total: lineTotal,
    metadata,
    modified_by_admin: Boolean(metadata.modified_by_admin),
  }
}

export function calculateItemsTotal(items: any[]) {
  return items.reduce((sum, item) => {
    const quantity = normalizeMoney(item.quantity)
    const unitPrice = normalizeMoney(
      item.unit_price ?? item.negotiated_unit_price ?? item.requested_unit_price
    )
    return sum + quantity * unitPrice
  }, 0)
}

export function buildQuotePreview(quote: any, draftOrder?: any) {
  const sourceItems = draftOrder?.items?.length ? draftOrder.items : getQuoteSourceItems(quote)
  const items = sourceItems.map((item: any, index: number) => normalizeQuoteItem(item, index))
  const subtotal = calculateItemsTotal(items)
  const originalSubtotal = getQuoteOriginalTotalMinor({
    ...quote,
    subtotal: draftOrder?.subtotal ?? quote.subtotal ?? subtotal,
  })
  const shipping = normalizeMoney(draftOrder?.shipping_total || 0)
  const discount = normalizeMoney(draftOrder?.discount_total || 0)
  const total = subtotal + shipping - discount

  return {
    items,
    original_subtotal: originalSubtotal,
    subtotal,
    shipping_total: shipping,
    discount_total: discount,
    total,
    currency_code: quote.currency_code || draftOrder?.currency_code || "cad",
  }
}

export const formatQuote = (
  quote: any,
  details: Record<string, any> = {}
) => {
  const draftOrder = details.draft_order || null
  const preview = details.preview || buildQuotePreview(quote, draftOrder)
  const items = preview.items || []
  const subtotal = getQuoteNegotiatedSubtotalMinor({
    ...quote,
    total: quote.negotiated_total ?? preview.subtotal,
  })
  const total = getQuoteFinalPayableTotalMinor({
    ...quote,
    total: quote.negotiated_total ?? preview.total,
  })
  const originalTotal = getQuoteOriginalTotalMinor(quote)
  const negotiatedTotal = quote.negotiated_total == null ? null : getQuoteNegotiatedTotalMinor(quote)
  const commissionFields = quoteCommissionResponseFields({
    ...quote,
    negotiated_total: negotiatedTotal ?? subtotal,
    total,
  })
  const requestedItems = Array.isArray(quote.requested_items) ? quote.requested_items : []
  const negotiatedItems = Array.isArray(quote.negotiated_items) ? quote.negotiated_items : []
  const totalUnits = items.reduce((sum: number, item: any) => sum + normalizeMoney(item.quantity), 0)

  return {
    id: quote.id,
    status: quote.status,
    company_id: quote.company_id,
    company: details.company || null,
    customer_id: quote.customer_id,
    customer: details.customer || null,
    customer_email: quote.customer_email,
    customer_name: quote.customer_name,
    company_name: quote.company_name || details.company?.company_name || null,
    company_status: details.company?.status || null,
    cart_id: quote.cart_id || quote.created_cart_id,
    draft_order_id: quote.draft_order_id,
    order_change_id: quote.order_change_id,
    order_id: quote.order_id || quote.created_order_id,
    requested_items: requestedItems,
    requested_total: quote.requested_total || quote.subtotal || 0,
    original_total: originalTotal,
    negotiated_items: negotiatedItems,
    negotiated_total: negotiatedTotal,
    ...commissionFields,
    quote_adjustment_total: quoteAdjustmentTotalMinor({
      ...quote,
      original_total: originalTotal,
      negotiated_total: negotiatedTotal ?? total,
    }),
    payment_state: quote.payment_state || "not_required",
    payment_terms: quote.payment_terms || quote.metadata?.payment_terms || null,
    payment_due_date: quote.payment_due_date || null,
    payment_collection_id: quote.payment_collection_id || quote.metadata?.payment_collection_id || null,
    selected_payment_provider_id: quote.selected_payment_provider_id || quote.metadata?.selected_payment_provider_id || null,
    offer_version: quote.offer_version || 1,
    items,
    item_count: items.length,
    items_count: items.length,
    total_units: totalUnits,
    currency_code: quote.currency_code || draftOrder?.currency_code || "cad",
    subtotal,
    total,
    note: quote.buyer_note || quote.customer_note || quote.note || null,
    buyer_note: quote.buyer_note || quote.customer_note,
    admin_note: quote.admin_note || quote.admin_notes,
    admin_notes: quote.admin_note || quote.admin_notes,
    rejection_reason: quote.rejection_reason,
    expires_at: quote.expires_at,
    sent_at: quote.sent_at,
    accepted_at: quote.accepted_at,
    rejected_at: quote.rejected_at,
    paid_at: quote.paid_at,
    created_at: quote.created_at,
    updated_at: quote.updated_at,
    metadata: quote.metadata,
    cart: details.cart || null,
    draft_order: draftOrder
      ? {
          ...draftOrder,
          items_count: draftOrder.items?.length || 0,
        }
      : null,
    order_change: details.order_change || null,
    preview,
  }
}

export async function hydrateAdminQuote(req: any, quote: any) {
  const query: any = req.scope.resolve("query")
  const customerModule: any = req.scope.resolve(Modules.CUSTOMER)
  const details: Record<string, any> = {}

  if (quote.customer_id) {
    try {
      details.customer = await customerModule.retrieveCustomer(quote.customer_id)
    } catch {
      details.customer = null
    }
  }

  if (quote.company_id) {
    try {
      const { data } = await query.graph({
        entity: "company",
        fields: [
          "id",
          "company_name",
          "status",
          "tax_id",
          "gstin",
          "email",
          "phone",
          "credit_limit",
          "requested_credit_limit",
          "approved_credit_limit",
        ],
        filters: { id: quote.company_id },
      })
      details.company = data?.[0] || null
    } catch {
      details.company = null
    }
  }

  if (quote.cart_id || quote.created_cart_id) {
    try {
      const { data } = await query.graph({
        entity: "cart",
        fields: ["id", "email", "currency_code", "total", "subtotal", "items.id", "items.title", "items.quantity"],
        filters: { id: quote.cart_id || quote.created_cart_id },
      })
      details.cart = data?.[0] || null
    } catch {
      details.cart = null
    }
  }

  if (quote.draft_order_id) {
    try {
      const { data } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "status",
          "currency_code",
          "total",
          "subtotal",
          "shipping_total",
          "discount_total",
          "items.id",
          "items.title",
          "items.variant_id",
          "items.product_id",
          "items.product_title",
          "items.variant_sku",
          "items.quantity",
          "items.unit_price",
          "items.total",
          "created_at",
          "updated_at",
        ],
        filters: { id: quote.draft_order_id },
      })
      details.draft_order = data?.[0] || null
    } catch {
      details.draft_order = null
    }
  }

  if (quote.order_change_id) {
    try {
      const { data } = await query.graph({
        entity: "order_change",
        fields: ["id", "status", "change_type", "order_id", "actions.*", "created_at", "updated_at"],
        filters: { id: quote.order_change_id },
      })
      details.order_change = data?.[0] || null
    } catch {
      details.order_change = null
    }
  }

  details.preview = buildQuotePreview(quote, details.draft_order)
  return formatQuote(quote, details)
}

export async function retrieveAdminQuote(req: any, id: string) {
  const b2bService: any = req.scope.resolve(B2B_MODULE)
  const quote = await b2bService.retrieveQuote(id)

  if (!quote) {
    const error: any = new Error("B2B quote not found")
    error.status = 404
    throw error
  }

  return quote
}

export function statusFromError(error: any) {
  if (Number.isInteger(error?.status)) {
    return error.status
  }

  if (error?.type === "not_found") {
    return 404
  }

  return 400
}
