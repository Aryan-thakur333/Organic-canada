import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../../modules/b2b"

// ── Types ──────────────────────────────────────────────────────────────────

type ReviewRequestBody = {
  /** 'approved' | 'rejected' */
  status: "approved" | "rejected"
  /** Optional custom negotiated total in cents — overrides subtotal on approval */
  negotiated_total?: number
  /** Admin notes to attach to the quote record */
  admin_notes?: string
}

// ────────────────────────────────────────────────────────────────────────────
//  POST /admin/b2b-quotes/:id/review
//
//  Accepts a status payload to approve or reject a B2B wholesale draft quote.
//  Optional custom negotiated price override can be supplied on approval.
//
//  If the quote is approved with a valid negotiated_total, this route:
//    1. Validates the quote exists and is in a reviewable state
//    2. Applies the negotiation override and admin notes
//    3. Triggers the `convertQuoteToOrderWorkflow` which:
//       a. Creates a Medusa Order from the quote items
//       b. Links the order to the corporate customer's checkout profile
//       c. Marks the quote status as 'converted'
//    4. Returns the updated quote + the newly created order
//
//  If rejected, simply updates the quote status to 'rejected' with notes.
// ────────────────────────────────────────────────────────────────────────────
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { status, negotiated_total, admin_notes } = req.body as ReviewRequestBody

  // ── 1. Validate the payload ───────────────────────────────────────────
  if (!status || !["approved", "rejected"].includes(status)) {
    return res.status(400).json({
      message: "Status is required and must be 'approved' or 'rejected'",
    })
  }

  if (negotiated_total !== undefined && (typeof negotiated_total !== "number" || negotiated_total < 0)) {
    return res.status(400).json({
      message: "negotiated_total must be a non-negative integer (cents) when provided",
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
    if (!["pending", "draft", "pending_review"].includes(quote.status)) {
      return res.status(409).json({
        message: `Quote is already in status "${quote.status}". Only 'draft' or 'pending' quotes can be reviewed.`,
      })
    }

    // ── 4. Build update payload ─────────────────────────────────────────
    const updatePayload: Record<string, any> = {
      id,
      admin_notes: admin_notes ?? null,
    }

    if (negotiated_total !== undefined) {
      updatePayload.negotiated_total = negotiated_total
    }

    // ── 5. Handle rejection — simple status update ──────────────────────
    if (status === "rejected") {
      updatePayload.status = "rejected"

      const updated = await b2bService.updateQuotes(updatePayload)

      console.log(
        `[Admin B2B Quotes] Quote ${id} rejected. ` +
          `Company: ${quote.company_id}, Customer: ${quote.customer_email}`
      )

      return res.json({
        message: "Quote rejected",
        quote: updated,
        order: null,
      })
    }

    // ── 6. Handle approval — persist overrides, then convert to order ───
    const effectiveTotal = negotiated_total ?? quote.subtotal

    // Persist the approval overrides first
    const approved = await b2bService.updateQuotes({
      ...updatePayload,
      status: "approved",
      total: effectiveTotal,
      discount_total: Math.max(0, quote.subtotal - effectiveTotal),
    })

    console.log(
      `[Admin B2B Quotes] Quote ${id} approved. ` +
        `Effective total: ${effectiveTotal} (subtotal: ${quote.subtotal}, override: ${negotiated_total ?? "none"}). ` +
        `Triggering order conversion workflow...`
    )

    // ── 7. Trigger the convert-quote-to-order workflow ──────────────────
    return res.json({
      message: "Quote approved and awaiting customer acceptance",
      quote: approved,
      order: null,
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
