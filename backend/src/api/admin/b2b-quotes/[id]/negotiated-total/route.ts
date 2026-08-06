import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../../modules/b2b"
import {
  getQuoteOriginalTotalMinor,
  normalizeMoneyToMinor,
  quoteAdjustmentTotalMinor,
  storedMinor,
} from "../../../../../utils/b2b/money"
import {
  getQuoteSourceItems,
  hydrateAdminQuote,
  isLockedQuoteStatus,
  normalizeQuoteItem,
  statusFromError,
} from "../../utils"
import {
  calculateB2BQuoteCommissionSnapshot,
  quoteCommissionMetadata,
} from "../../../../../utils/b2b/quote-commission"

type NegotiatedTotalBody = {
  negotiated_total?: number | string
  expires_at?: string | null
  payment_terms?: string | null
  admin_note?: string | null
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const body = ((req as any).validatedBody || req.body || {}) as NegotiatedTotalBody

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const quote = await b2bService.retrieveQuote(id)

    if (!quote) {
      return res.status(404).json({ message: "B2B quote not found" })
    }

    if (isLockedQuoteStatus(quote.status)) {
      return res.status(400).json({
        message: `Quote status is "${quote.status}". This quote cannot be edited.`,
      })
    }

    if (body.negotiated_total == null || String(body.negotiated_total).trim() === "") {
      return res.status(400).json({ message: "negotiated_total is required" })
    }

    const negotiatedTotal = normalizeMoneyToMinor(body.negotiated_total, "frontend_decimal")
    const originalTotal = getQuoteOriginalTotalMinor(quote) || storedMinor(quote.requested_total ?? quote.total)
    const maxNegotiatedTotal = Math.max(originalTotal * 10, 100_000_000)

    if (negotiatedTotal <= 0) {
      return res.status(400).json({ message: "negotiated_total must be greater than 0" })
    }

    if (negotiatedTotal > maxNegotiatedTotal) {
      return res.status(400).json({ message: "negotiated_total exceeds the allowed business limit" })
    }

    const items = getQuoteSourceItems(quote).map((item, index) => normalizeQuoteItem(item, index))
    const nextOfferVersion = Math.max(1, storedMinor(quote.offer_version, 1)) + 1

    const expiresAt =
      body.expires_at === null
        ? null
        : body.expires_at
          ? new Date(body.expires_at)
          : quote.expires_at || null

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return res.status(400).json({ message: "expires_at must be a valid date" })
    }

    const paymentTerms = String(body.payment_terms || quote.payment_terms || "due_on_receipt").trim()
    const commissionSnapshot = await calculateB2BQuoteCommissionSnapshot({
      container: req.scope,
      baseAmount: negotiatedTotal,
      currencyCode: quote.currency_code || "cad",
    })

    const updated = await b2bService.updateQuotes({
      id,
      original_total: originalTotal,
      negotiated_items: items,
      negotiated_total: negotiatedTotal,
      quote_adjustment_total: quoteAdjustmentTotalMinor({
        ...quote,
        original_total: originalTotal,
        negotiated_total: negotiatedTotal,
      }),
      subtotal: negotiatedTotal,
      total: commissionSnapshot.final_payable_total,
      expires_at: expiresAt,
      payment_terms: paymentTerms,
      offer_version: nextOfferVersion,
      admin_note: body.admin_note ?? quote.admin_note ?? null,
      admin_notes: body.admin_note ?? quote.admin_notes ?? quote.admin_note ?? null,
      payment_state: quote.payment_state || "not_required",
      metadata: {
        ...quoteCommissionMetadata(quote.metadata, commissionSnapshot),
        original_total: originalTotal,
        negotiated_total: negotiatedTotal,
        negotiated_subtotal: negotiatedTotal,
        quote_adjustment_total: negotiatedTotal - originalTotal,
        offer_version: nextOfferVersion,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        payment_terms: paymentTerms,
        final_offer_saved_at: new Date().toISOString(),
      },
    })

    return res.json({
      quote: await hydrateAdminQuote(req, updated),
      message: "Negotiated total saved.",
    })
  } catch (error: any) {
    console.error("[Admin B2B Quotes] Negotiated total error:", error)
    return res.status(statusFromError(error)).json({
      message: error.message || "Failed to save negotiated total",
    })
  }
}
