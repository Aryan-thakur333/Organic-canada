import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../../modules/b2b"

// ── Types ──────────────────────────────────────────────────────────────────

type NegotiatedItem = {
  variant_id: string
  quantity: number
  negotiated_unit_price: number
}

type ReviewRequestBody = {
  /**
   * 'approved' | 'rejected'
   */
  status: "approved" | "rejected"

  /**
   * For approval: array of negotiated items with per-variant pricing.
   * Must match the requested items' variants.
   */
  negotiated_items?: NegotiatedItem[]

  /**
   * Admin note attached to quote
   */
  admin_note?: string

  /**
   * Rejection reason (required when status='rejected')
   */
  rejection_reason?: string

  /**
   * ISO date string for quote expiry (optional, defaults to 7 days from now)
   */
  expires_at?: string
}

// ────────────────────────────────────────────────────────────────────────────
//  POST /admin/b2b-quotes/:id/review
//
//  Approves or rejects a B2B quote request with per-item negotiated pricing.
//
//  Approve payload:
//    {
//      "status": "approved",
//      "negotiated_items": [
//        { "variant_id": "variant_xxx", "quantity": 50, "negotiated_unit_price": 9 }
//      ],
//      "admin_note": "Approved bulk price for 7 days",
//      "expires_at": "2026-07-05T00:00:00.000Z"
//    }
//
//  Reject payload:
//    {
//      "status": "rejected",
//      "rejection_reason": "Quantity too low for wholesale quote",
//      "admin_note": "Please increase quantity."
//    }
// ────────────────────────────────────────────────────────────────────────────
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { status, negotiated_items, admin_note, rejection_reason, expires_at } = req.body as ReviewRequestBody

  // ── 1. Validate the payload ───────────────────────────────────────────
  if (!status || !["approved", "rejected"].includes(status)) {
    return res.status(400).json({
      message: "Status is required and must be 'approved' or 'rejected'",
    })
  }

  if (status === "rejected" && !rejection_reason) {
    return res.status(400).json({
      message: "Rejection reason is required when rejecting a quote",
    })
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)

    // ── 2. Retrieve the quote ───────────────────────────────────────────
    const quote = await b2bService.retrieveQuote(id)
    if (!quote) {
      return res.status(404).json({ message: "B2B quote not found" })
    }

    // ── 3. Validate the quote is in a reviewable state ──────────────────
    if (!["pending_review", "draft", "pending"].includes(quote.status)) {
      return res.status(409).json({
        message: `Quote is already in status "${quote.status}". Only 'pending_review' quotes can be reviewed.`,
      })
    }

    // ── 4. Handle rejection — simple status update ──────────────────────
    if (status === "rejected") {
      const updated = await b2bService.updateQuotes({
        id,
        status: "rejected",
        rejection_reason: rejection_reason || null,
        admin_note: admin_note || null,
        rejected_at: new Date().toISOString(),
      })

      console.log(
        `[Admin B2B Quotes] Quote ${id} rejected. ` +
          `Reason: ${rejection_reason}`
      )

      return res.json({
        message: "Quote rejected.",
        quote: {
          id: updated.id,
          status: updated.status,
          rejection_reason: updated.rejection_reason,
          admin_note: updated.admin_note,
          rejected_at: updated.rejected_at,
        },
      })
    }

    // ── 5. Handle approval — validate and apply negotiated pricing ─────
    const requestedItems = quote.requested_items || quote.items || []

    // Validate negotiated_items
    if (!negotiated_items || !Array.isArray(negotiated_items) || negotiated_items.length === 0) {
      return res.status(400).json({
        message: "negotiated_items is required when approving a quote. Provide per-item negotiated pricing.",
      })
    }

    // Validate each negotiated item
    for (const [i, item] of negotiated_items.entries()) {
      if (!item.variant_id) {
        return res.status(400).json({
          message: `negotiated_items[${i}] is missing 'variant_id'`,
        })
      }
      if (typeof item.quantity !== "number" || item.quantity < 1) {
        return res.status(400).json({
          message: `negotiated_items[${i}] has an invalid 'quantity' — must be a positive integer`,
        })
      }
      if (typeof item.negotiated_unit_price !== "number" || item.negotiated_unit_price < 0) {
        return res.status(400).json({
          message: `negotiated_items[${i}] has an invalid 'negotiated_unit_price' — must be a non-negative number (cents)`,
        })
      }

      // Check variant exists in requested items
      const matchingRequested = requestedItems.find(
        (ri: any) => ri.variant_id === item.variant_id
      )
      if (!matchingRequested) {
        return res.status(400).json({
          message: `negotiated_items[${i}] variant_id "${item.variant_id}" not found in the requested items`,
        })
      }
    }

    // ── 6. Build negotiated_items snapshot ──────────────────────────────
    const negotiatedItemsSnapshot = negotiated_items.map((item) => {
      const matchingRequested = requestedItems.find(
        (ri: any) => ri.variant_id === item.variant_id
      )

      return {
        product_id: matchingRequested?.product_id || null,
        variant_id: item.variant_id,
        title: matchingRequested?.title || "Unknown Product",
        sku: matchingRequested?.sku || null,
        quantity: item.quantity,
        negotiated_unit_price: item.negotiated_unit_price,
        line_total: item.quantity * item.negotiated_unit_price,
      }
    })

    // ── 7. Calculate negotiated_total ───────────────────────────────────
    const negotiated_total = negotiatedItemsSnapshot.reduce(
      (sum, item) => sum + item.line_total,
      0
    )

    // ── 8. Set expiry ───────────────────────────────────────────────────
    const effectiveExpiry = expires_at
      ? new Date(expires_at)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days default

    // ── 9. Update quote with approval ───────────────────────────────────
    const updated = await b2bService.updateQuotes({
      id,
      status: "approved",
      negotiated_items: negotiatedItemsSnapshot,
      negotiated_total,
      admin_note: admin_note || null,
      expires_at: effectiveExpiry,
      // Legacy fields
      total: negotiated_total,
      discount_total: Math.max(0, (quote.requested_total || quote.subtotal || 0) - negotiated_total),
    })

    console.log(
      `[Admin B2B Quotes] Quote ${id} approved. ` +
        `Negotiated total: ${negotiated_total} (requested: ${quote.requested_total || quote.subtotal || 0}). ` +
        `Expires: ${effectiveExpiry.toISOString()}`
    )

    return res.json({
      message: "Quote approved.",
      quote: {
        id: updated.id,
        status: updated.status,
        negotiated_items: updated.negotiated_items,
        negotiated_total: updated.negotiated_total,
        admin_note: updated.admin_note,
        expires_at: updated.expires_at,
      },
    })
  } catch (error: any) {
    console.error("[Admin B2B Quotes] Review error:", error)

    if (error instanceof MedusaError) {
      const httpStatus = error.type === "not_found" ? 404 : error.type === "not_allowed" ? 409 : 400
      return res.status(httpStatus).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to review B2B quote" })
  }
}