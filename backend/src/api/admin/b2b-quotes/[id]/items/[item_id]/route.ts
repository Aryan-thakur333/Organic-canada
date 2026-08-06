import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../../../modules/b2b"
import {
  calculateItemsTotal,
  getQuoteItemId,
  getQuoteSourceItems,
  hydrateAdminQuote,
  isPendingMerchantStatus,
  normalizeQuoteItem,
  retrieveAdminQuote,
  statusFromError,
} from "../../../utils"
import {
  getQuoteOriginalTotalMinor,
  quoteAdjustmentTotalMinor,
  storedMinor,
} from "../../../../../../utils/b2b/money"
import {
  calculateB2BQuoteCommissionSnapshot,
  quoteCommissionMetadata,
} from "../../../../../../utils/b2b/quote-commission"

function toMinorUnits(value: number) {
  return Math.round(Number(value) * 100)
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id, item_id } = req.params
  const { quantity, unit_price } = req.body as {
    quantity?: number
    unit_price?: number
  }

  if (quantity !== undefined && (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0)) {
    return res.status(400).json({ message: "quantity must be greater than 0" })
  }

  if (unit_price !== undefined && (!Number.isFinite(Number(unit_price)) || Number(unit_price) <= 0)) {
    return res.status(400).json({ message: "unit_price must be greater than 0" })
  }

  if (quantity === undefined && unit_price === undefined) {
    return res.status(400).json({ message: "quantity or unit_price is required" })
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const quote = await retrieveAdminQuote(req, id)

    if (!isPendingMerchantStatus(quote.status)) {
      return res.status(400).json({
        message: `Quote status is "${quote.status}". Only pending merchant quotes can be edited.`,
      })
    }

    const sourceItems = getQuoteSourceItems(quote)
    const targetIndex = sourceItems.findIndex((item: any, index: number) =>
      getQuoteItemId(item, index) === item_id ||
      item.id === item_id ||
      item.item_id === item_id ||
      item.variant_id === item_id
    )

    if (targetIndex < 0) {
      return res.status(404).json({ message: "Quote item not found" })
    }

    const normalizedItems = sourceItems.map((item: any, index: number) =>
      normalizeQuoteItem(item, index)
    )
    const target = normalizedItems[targetIndex]
    const nextQuantity = quantity !== undefined ? Number(quantity) : Number(target.quantity)
    const nextUnitPrice = unit_price !== undefined
      ? toMinorUnits(Number(unit_price))
      : Number(target.unit_price || target.negotiated_unit_price || target.requested_unit_price)

    const updatedItems = normalizedItems.map((item: any, index: number) => {
      if (index !== targetIndex) {
        return item
      }

      const existingMetadata = item.metadata || {}
      const originalUnitPrice =
        existingMetadata.original_unit_price ??
        item.original_unit_price ??
        item.requested_unit_price ??
        item.unit_price

      return {
        ...item,
        id: getQuoteItemId(item, index),
        item_id: getQuoteItemId(item, index),
        product_id: item.product_id || null,
        variant_id: item.variant_id || null,
        title: item.title,
        sku: item.sku || null,
        quantity: nextQuantity,
        unit_price: nextUnitPrice,
        original_unit_price: originalUnitPrice,
        requested_unit_price: originalUnitPrice,
        negotiated_unit_price: nextUnitPrice,
        current_calculated_unit_price: nextUnitPrice,
        line_total: nextQuantity * nextUnitPrice,
        total: nextQuantity * nextUnitPrice,
        metadata: {
          ...existingMetadata,
          original_unit_price: originalUnitPrice,
          modified_by_admin: true,
          admin_modified_at: new Date().toISOString(),
        },
      }
    })

    const negotiatedTotal = calculateItemsTotal(updatedItems)
    const originalTotal = getQuoteOriginalTotalMinor(quote) || storedMinor(quote.requested_total ?? negotiatedTotal)
    const commissionSnapshot = await calculateB2BQuoteCommissionSnapshot({
      container: req.scope,
      baseAmount: negotiatedTotal,
      currencyCode: quote.currency_code || "cad",
    })
    const nextOfferVersion = Math.max(1, storedMinor(quote.offer_version, 1)) + 1
    const nextMetadata = {
      ...quoteCommissionMetadata(quote.metadata, commissionSnapshot),
      original_total: originalTotal,
      negotiated_total: negotiatedTotal,
      negotiated_subtotal: negotiatedTotal,
      quote_adjustment_total: negotiatedTotal - originalTotal,
      offer_version: nextOfferVersion,
      quote_item_edits: {
        ...((quote.metadata || {}).quote_item_edits || {}),
        [item_id]: {
          item_id,
          quantity: nextQuantity,
          unit_price: nextUnitPrice,
          updated_at: new Date().toISOString(),
        },
      },
    }

    const updated = await b2bService.updateQuotes({
      id,
      requested_items: quote.requested_items,
      items: quote.items,
      negotiated_items: updatedItems,
      original_total: originalTotal,
      negotiated_total: negotiatedTotal,
      quote_adjustment_total: quoteAdjustmentTotalMinor({
        ...quote,
        original_total: originalTotal,
        negotiated_total: negotiatedTotal,
      }),
      offer_version: nextOfferVersion,
      requested_total: quote.requested_total,
      subtotal: negotiatedTotal,
      total: commissionSnapshot.final_payable_total,
      metadata: nextMetadata,
    })

    return res.json({
      quote: await hydrateAdminQuote(req, updated),
      message: "Quote item updated.",
    })
  } catch (error: any) {
    console.error("[Admin B2B Quotes] Update item error:", error)
    return res.status(statusFromError(error)).json({
      message: error.message || "Failed to update B2B quote item",
    })
  }
}
