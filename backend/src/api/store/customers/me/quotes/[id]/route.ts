import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../../../modules/b2b"
import {
  getQuoteNegotiatedTotalMinor,
  getQuoteOriginalTotalMinor,
  quoteAdjustmentTotalMinor,
} from "../../../../../../utils/b2b/money"
import {
  getQuoteFinalPayableTotalMinor,
  getQuoteNegotiatedSubtotalMinor,
  quoteCommissionResponseFields,
} from "../../../../../../utils/b2b/quote-commission"
import { assertStoreQuoteAccess } from "../../../../../../utils/b2b/quote-messages"

function quoteResponse(q: any, details: Record<string, any> = {}) {
  const preview = buildPreview(q, details.draft_order)
  const items = preview.items
  const requestedTotal = toNumber(q.requested_total ?? q.subtotal, preview.original_subtotal)
  const total = getQuoteFinalPayableTotalMinor({
    ...q,
    total: q.negotiated_total ?? preview.total,
  })
  const originalTotal = getQuoteOriginalTotalMinor(q)
  const negotiatedTotal = q.negotiated_total == null ? null : getQuoteNegotiatedTotalMinor(q)
  const negotiatedSubtotal = getQuoteNegotiatedSubtotalMinor({
    ...q,
    total: q.negotiated_total ?? preview.subtotal,
  })
  const commissionFields = quoteCommissionResponseFields({
    ...q,
    negotiated_total: negotiatedTotal ?? negotiatedSubtotal,
    total,
  })

  return {
    id: q.id,
    status: q.status,
    customer_id: q.customer_id,
    company_id: q.company_id,
    company_name:
      details.company?.company_name ||
      q.company_name ||
      q.company?.company_name ||
      q.metadata?.company_name ||
      null,
    customer_email: q.customer_email || q.email || q.metadata?.customer_email || null,
    customer_name: q.customer_name || q.metadata?.customer_name || null,
    cart_id: q.cart_id || q.created_cart_id,
    draft_order_id: q.draft_order_id,
    order_change_id: q.order_change_id,
    order_id: q.order_id || q.created_order_id || q.metadata?.order_id || null,
    converted_order_id: q.order_id || q.created_order_id || q.metadata?.converted_order_id || null,
    requested_items: q.requested_items || q.items || items,
    requested_total: requestedTotal,
    original_total: originalTotal,
    negotiated_items: q.negotiated_items,
    negotiated_total: negotiatedTotal,
    ...commissionFields,
    quote_adjustment_total: quoteAdjustmentTotalMinor({
      ...q,
      original_total: originalTotal,
      negotiated_total: negotiatedTotal ?? total,
    }),
    payment_state: q.payment_state || "not_required",
    payment_terms: q.payment_terms || q.metadata?.payment_terms || null,
    payment_due_date: q.payment_due_date || null,
    payment_collection_id: q.payment_collection_id || q.metadata?.payment_collection_id || null,
    selected_payment_provider_id: q.selected_payment_provider_id || q.metadata?.selected_payment_provider_id || null,
    offer_version: q.offer_version || 1,
    items,
    item_count: items.length,
    items_count: items.length,
    total_units: items.reduce((sum: number, item: any) => sum + toNumber(item.quantity), 0),
    subtotal: requestedTotal,
    total,
    currency_code: q.currency_code,
    buyer_note: q.buyer_note || q.customer_note,
    admin_note: q.admin_note || q.admin_notes,
    admin_notes: q.admin_note || q.admin_notes,
    rejection_reason: q.rejection_reason,
    expires_at: q.expires_at,
    sent_at: q.sent_at,
    accepted_at: q.accepted_at,
    rejected_at: q.rejected_at,
    paid_at: q.paid_at,
    draft_order: details.draft_order || null,
    order_change: details.order_change || null,
    company: details.company || null,
    order: details.order || null,
    preview,
    created_at: q.created_at,
    updated_at: q.updated_at,
    metadata: q.metadata,
  }
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function buildPreview(q: any, draftOrder?: any) {
  const edits = q.metadata?.quote_item_edits || {}
  const sourceItems = draftOrder?.items || q.negotiated_items || q.requested_items || q.items || []
  const items = sourceItems.map((item: any) => {
    const edit = edits[item.id] || edits[item.variant_id] || edits[item.item_id] || null
    const originalQuantity = Number(item.original_quantity ?? item.quantity ?? 0)
    const originalUnitPrice = Number(
      item.original_unit_price ??
        item.metadata?.original_unit_price ??
        item.requested_unit_price ??
        item.unit_price ??
        0
    )
    const quantity = Number(edit?.quantity ?? item.quantity ?? originalQuantity)
    const negotiatedUnitPrice = Number(
      edit?.unit_price ??
        item.negotiated_unit_price ??
        item.unit_price ??
        item.requested_unit_price ??
        originalUnitPrice
    )

    return {
      id: item.id || item.item_id || item.variant_id,
      product_id: item.product_id || null,
      variant_id: item.variant_id || null,
      title: item.title || item.product_title || "Item",
      sku: item.sku || item.variant_sku || null,
      original_quantity: originalQuantity,
      quantity,
      original_unit_price: originalUnitPrice,
      unit_price: negotiatedUnitPrice,
      requested_unit_price: Number(item.requested_unit_price ?? originalUnitPrice),
      negotiated_unit_price: negotiatedUnitPrice,
      original_line_total: originalQuantity * originalUnitPrice,
      line_total: quantity * negotiatedUnitPrice,
      total: quantity * negotiatedUnitPrice,
      metadata: item.metadata || {},
    }
  })

  const subtotal = items.reduce((sum: number, item: any) => sum + Number(item.line_total ?? 0), 0)
  return {
    items,
    original_subtotal: q.requested_total ?? q.original_total ?? q.subtotal ?? 0,
    subtotal,
    shipping_total: draftOrder?.shipping_total ?? 0,
    discount_total: draftOrder?.discount_total ?? 0,
    total: subtotal + Number(draftOrder?.shipping_total ?? 0) - Number(draftOrder?.discount_total ?? 0),
    currency_code: q.currency_code || draftOrder?.currency_code || "cad",
  }
}

function errorStatus(error: any): number {
  if (Number.isInteger(error?.status)) {
    return error.status
  }

  if (error instanceof MedusaError) {
    return error.type === "not_found" ? 404 : 400
  }

  return 400
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const query: any = req.scope.resolve("query")
    const quote = await b2bService.retrieveQuote(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    await assertStoreQuoteAccess(req, quote, customerId)

    const details: Record<string, any> = {}

    if (quote.draft_order_id) {
      const { data: orders } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "status",
          "display_id",
          "currency_code",
          "total",
          "subtotal",
          "items.id",
          "items.title",
          "items.variant_id",
          "items.product_id",
          "items.quantity",
          "items.unit_price",
          "items.total",
          "created_at",
          "updated_at",
        ],
        filters: { id: quote.draft_order_id },
      })
      details.draft_order = orders?.[0] || null
    }

    if (quote.order_change_id) {
      const { data: orderChanges } = await query.graph({
        entity: "order_change",
        fields: [
          "id",
          "status",
          "change_type",
          "order_id",
          "actions.*",
          "created_at",
          "updated_at",
        ],
        filters: { id: quote.order_change_id },
      })
      details.order_change = orderChanges?.[0] || null
    }

    if (quote.company_id) {
      const { data: companies } = await query.graph({
        entity: "company",
        fields: ["id", "company_name", "status"],
        filters: { id: quote.company_id },
      })
      details.company = companies?.[0] || null
    }

    if (quote.order_id || quote.created_order_id) {
      const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id", "display_id", "status", "currency_code", "total", "created_at", "metadata"],
        filters: { id: quote.order_id || quote.created_order_id },
      })
      details.order = orders?.[0] || null
    }

    return res.json({ quote: quoteResponse(quote, details) })
  } catch (error: any) {
    console.error("[Store Customer Quotes] Detail error:", error)
    return res.status(errorStatus(error)).json({
      message: error.message || "Failed to retrieve quote",
    })
  }
}
