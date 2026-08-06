import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../../modules/b2b"
import { createRequestForQuoteWorkflow } from "../../../../../workflows/create-request-for-quote"
import {
  getQuoteNegotiatedTotalMinor,
  getQuoteOriginalTotalMinor,
  quoteAdjustmentTotalMinor,
} from "../../../../../utils/b2b/money"
import {
  getQuoteFinalPayableTotalMinor,
  quoteCommissionResponseFields,
} from "../../../../../utils/b2b/quote-commission"

function toNumber(value: any, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function quoteItems(q: any) {
  const items = q.negotiated_items || q.requested_items || q.items || q.metadata?.items || []
  return Array.isArray(items) ? items : []
}

function itemsTotal(items: any[]) {
  return items.reduce((sum, item) => {
    const lineTotal = item.total ?? item.line_total ?? item.subtotal
    if (Number.isFinite(Number(lineTotal))) {
      return sum + Number(lineTotal)
    }

    const unitPrice =
      item.negotiated_unit_price ??
      item.unit_price ??
      item.requested_unit_price ??
      item.current_calculated_unit_price ??
      0
    return sum + toNumber(unitPrice) * toNumber(item.quantity)
  }, 0)
}

function quoteResponse(q: any) {
  const items = quoteItems(q)
  const requestedItems = Array.isArray(q.requested_items) ? q.requested_items : items
  const negotiatedItems = Array.isArray(q.negotiated_items) ? q.negotiated_items : null
  const fallbackTotal = itemsTotal(items)
  const requestedTotal = toNumber(q.requested_total ?? q.subtotal, fallbackTotal)
  const total = getQuoteFinalPayableTotalMinor({
    ...q,
    total: q.negotiated_total ?? q.total ?? q.requested_total ?? q.subtotal ?? fallbackTotal,
  })
  const originalTotal = getQuoteOriginalTotalMinor(q)
  const negotiatedTotal = q.negotiated_total == null ? null : getQuoteNegotiatedTotalMinor(q)
  const commissionFields = quoteCommissionResponseFields({
    ...q,
    negotiated_total: negotiatedTotal ?? total,
    total,
  })

  return {
    id: q.id,
    status: q.status,
    customer_id: q.customer_id,
    company_id: q.company_id,
    company_name: q.company_name || q.company?.company_name || q.metadata?.company_name || null,
    customer_email: q.customer_email || q.email || q.metadata?.customer_email || null,
    customer_name: q.customer_name || q.metadata?.customer_name || null,
    cart_id: q.cart_id || q.created_cart_id,
    draft_order_id: q.draft_order_id,
    order_change_id: q.order_change_id,
    order_id: q.order_id || q.created_order_id || q.metadata?.order_id || null,
    converted_order_id: q.order_id || q.created_order_id || q.metadata?.converted_order_id || null,
    requested_items: requestedItems,
    requested_total: requestedTotal,
    original_total: originalTotal,
    negotiated_items: negotiatedItems,
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
    total_units: items.reduce((sum, item) => sum + toNumber(item.quantity), 0),
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
    created_at: q.created_at,
    updated_at: q.updated_at,
    metadata: q.metadata,
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

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const body = ((req as any).validatedBody || req.body) as {
    cart_id: string
    note?: string
  }

  try {
    const { result } = await createRequestForQuoteWorkflow(req.scope).run({
      input: {
        cart_id: body.cart_id,
        customer_id: customerId,
        note: body.note,
      },
    })

    return res.status(201).json({ quote: quoteResponse(result) })
  } catch (error: any) {
    console.error("[Store Customer Quotes] Create error:", error)
    return res.status(errorStatus(error)).json({
      message: error.message || "Failed to request quote",
    })
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const { status, offset, limit } = req.query as Record<string, string | undefined>
    const skip = Math.max(0, Number(offset || 0) || 0)
    const take = Math.min(Math.max(1, Number(limit || 15) || 15), 100)

    const filters: Record<string, any> = { customer_id: customerId }
    if (status) {
      filters.status = status
    }

    const [quotes, count] = await b2bService.listAndCountQuotes(filters, {
      skip,
      take,
      order: { created_at: "DESC" },
    })

    return res.json({
      quotes: quotes.map(quoteResponse),
      count,
      offset: skip,
      limit: take,
    })
  } catch (error: any) {
    console.error("[Store Customer Quotes] List error:", error)
    return res.status(errorStatus(error)).json({
      message: error.message || "Failed to list quotes",
    })
  }
}
