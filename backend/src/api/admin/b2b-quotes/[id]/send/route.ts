import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../../modules/b2b"
import {
  calculateItemsTotal,
  getQuoteSourceItems,
  hydrateAdminQuote,
  isLockedQuoteStatus,
  isPendingCustomerStatus,
  isPendingMerchantStatus,
  normalizeQuoteItem,
  statusFromError,
} from "../../utils"
import {
  getQuoteOriginalTotalMinor,
  normalizeMoneyToMinor,
  quoteAdjustmentTotalMinor,
  storedMinor,
  minorToDecimalString,
} from "../../../../../utils/b2b/money"
import { validateQuoteInventoryAvailability } from "../../../../../utils/b2b/validate-quote-inventory"
import { createQuoteMessage } from "../../../../../utils/b2b/quote-messages"
import {
  calculateB2BQuoteCommissionSnapshot,
  quoteCommissionMetadata,
} from "../../../../../utils/b2b/quote-commission"

type SendQuoteBody = {
  admin_note?: string
  negotiated_total?: number | string | null
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { admin_note, negotiated_total } = (req.body || {}) as SendQuoteBody

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const quote = await b2bService.retrieveQuote(id)

    if (!quote) {
      return res.status(404).json({ message: "B2B quote not found" })
    }

    const hasStructuredOverride =
      negotiated_total !== null &&
      negotiated_total !== undefined &&
      String(negotiated_total).trim() !== ""

    if (isPendingCustomerStatus(quote.status) && !hasStructuredOverride) {
      return res.json({
        quote: await hydrateAdminQuote(req, quote),
        message: "Quote offer was already sent to customer.",
      })
    }

    if (isLockedQuoteStatus(quote.status)) {
      return res.status(400).json({
        message: `Quote status is "${quote.status}". This quote cannot be sent.`,
      })
    }

    if (!isPendingMerchantStatus(quote.status) && !(isPendingCustomerStatus(quote.status) && hasStructuredOverride)) {
      return res.status(400).json({
        message: `Quote status is "${quote.status}". Only pending merchant quotes can be sent.`,
      })
    }

    const items = getQuoteSourceItems(quote).map((item, index) => normalizeQuoteItem(item, index))
    if (!items.length) {
      return res.status(400).json({ message: "Quote must have at least one item before it can be sent." })
    }

    const total = calculateItemsTotal(items)
    const now = new Date().toISOString()
    const originalTotal = getQuoteOriginalTotalMinor(quote) || storedMinor(quote.requested_total ?? total)
    
    const negotiatedTotal = hasStructuredOverride
      ? normalizeMoneyToMinor(negotiated_total, "frontend_decimal")
      : quote.negotiated_total !== null && quote.negotiated_total !== undefined
        ? storedMinor(quote.negotiated_total)
        : total

    if (negotiatedTotal <= 0) {
      return res.status(400).json({ message: "negotiated_total must be greater than 0" })
    }

    const commissionSnapshot = await calculateB2BQuoteCommissionSnapshot({
      container: req.scope,
      baseAmount: negotiatedTotal,
      currencyCode: quote.currency_code || "cad",
    })

    await validateQuoteInventoryAvailability({ quote: { ...quote, negotiated_items: items }, container: req.scope })
    const nextOfferVersion = Math.max(1, storedMinor(quote.offer_version, 1))
    const updated = await b2bService.updateQuotes({
      id,
      status: "pending_customer",
      negotiated_items: items,
      original_total: originalTotal,
      negotiated_total: negotiatedTotal,
      quote_adjustment_total: quoteAdjustmentTotalMinor({
        ...quote,
        original_total: originalTotal,
        negotiated_total: negotiatedTotal,
      }),
      subtotal: negotiatedTotal,
      total: commissionSnapshot.final_payable_total,
      admin_note: admin_note || quote.admin_note || null,
      admin_notes: admin_note || quote.admin_notes || quote.admin_note || null,
      sent_at: new Date(now),
      payment_terms: quote.payment_terms || "due_on_receipt",
      payment_state: quote.payment_state || "not_required",
      offer_version: nextOfferVersion,
      metadata: {
        ...quoteCommissionMetadata(quote.metadata, commissionSnapshot),
        sent_to_customer_at: now,
        sent_at: now,
        original_total: originalTotal,
        negotiated_total: negotiatedTotal,
        negotiated_subtotal: negotiatedTotal,
        quote_adjustment_total: negotiatedTotal - originalTotal,
        offer_version: nextOfferVersion,
      },
    })

    await createQuoteMessage(req, {
      quote_id: id,
      sender_type: "system",
      sender_id: null,
      message: `Final offer sent: $${minorToDecimalString(negotiatedTotal)} + $${minorToDecimalString(commissionSnapshot.commission_amount)} B2B fee = $${minorToDecimalString(commissionSnapshot.final_payable_total)}`,
      is_system_message: true,
      metadata: {
        offer_version: nextOfferVersion,
        negotiated_total: negotiatedTotal,
        negotiated_subtotal: negotiatedTotal,
        commission_amount: commissionSnapshot.commission_amount,
        final_payable_total: commissionSnapshot.final_payable_total,
      },
    })

    return res.json({
      quote: await hydrateAdminQuote(req, updated),
      message: "Quote offer sent to customer.",
    })
  } catch (error: any) {
    console.error("[Admin B2B Quotes] Send error:", error)
    return res.status(statusFromError(error)).json({
      message: error.message || "Failed to send B2B quote",
    })
  }
}
