import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../../modules/b2b"
import { MedusaError } from "@medusajs/framework/utils"

/**
 * GET /store/b2b/quotes/:id
 *
 * Returns the full quote detail.
 * Customer must own the quote (customer_id match).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const service: any = req.scope.resolve(B2B_MODULE)
    const quote = await service.retrieveQuote(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    // Only the quote owner can view it
    if (quote.customer_id !== customerId) {
      return res.status(403).json({ message: "Access denied: this quote does not belong to you" })
    }

    return res.json({
      quote: {
        id: quote.id,
        company_id: quote.company_id,
        customer_id: quote.customer_id,
        customer_email: quote.customer_email,
        status: quote.status,
        requested_items: quote.requested_items,
        requested_total: quote.requested_total,
        negotiated_items: quote.negotiated_items,
        negotiated_total: quote.negotiated_total,
        buyer_note: quote.buyer_note,
        admin_note: quote.admin_note,
        rejection_reason: quote.rejection_reason,
        expires_at: quote.expires_at,
        accepted_at: quote.accepted_at,
        rejected_at: quote.rejected_at,
        created_cart_id: quote.created_cart_id,
        created_order_id: quote.created_order_id,
        company_name: quote.company_name,
        customer_name: quote.customer_name,
        currency_code: quote.currency_code,
        created_at: quote.created_at,
        updated_at: quote.updated_at,
        metadata: quote.metadata,
      },
    })
  } catch (error: any) {
    console.error("[B2B Quotes] Detail error:", error)

    if (error instanceof MedusaError) {
      if (error.type === "not_found") {
        return res.status(404).json({ message: "Quote not found" })
      }
      return res.status(400).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to retrieve quote" })
  }
}