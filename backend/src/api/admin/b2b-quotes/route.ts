import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../modules/b2b"

// ────────────────────────────────────────────────────────────────────────────
//  GET /admin/b2b-quotes
//
//  Lists all B2B quote requests with optional filtering.
//  Supports filters: status, company_id, customer_email, limit, offset
//
//  Response shape:
//    {
//      quotes: Array<{
//        id, company_name, customer_email, status,
//        requested_total, negotiated_total, items_count,
//        created_at, expires_at
//      }>,
//      count: number
//    }
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)

    const { status, company_id, customer_email, offset, limit } = req.query as Record<string, string | undefined>

    // ── 1. Build query filters ──────────────────────────────────────────
    const filters: Record<string, any> = {}
    if (status) filters.status = status
    if (company_id) filters.company_id = company_id
    if (customer_email) filters.customer_email = customer_email

    const skip = Math.max(0, parseInt(offset || "0", 10) || 0)
    const take = Math.min(Math.max(1, parseInt(limit || "50", 10) || 50), 200)

    // ── 2. Fetch quotes ─────────────────────────────────────────────────
    const [allQuotes, totalCount] = await b2bService.listAndCountQuotes(filters, {
      skip,
      take,
      order: { created_at: "DESC" },
    })

    // ── 3. Map to response format ───────────────────────────────────────
    const quotes = allQuotes.map((q: any) => {
      const requestedItems = q.requested_items || q.items || []
      const negotiatedItems = q.negotiated_items || []
      const itemsCount = requestedItems.length

      return {
        id: q.id,
        company_id: q.company_id,
        company_name: q.company_name,
        customer_id: q.customer_id,
        customer_email: q.customer_email,
        customer_name: q.customer_name,
        status: q.status,
        requested_items: requestedItems,
        requested_total: q.requested_total || q.subtotal || 0,
        negotiated_items: negotiatedItems,
        negotiated_total: q.negotiated_total,
        buyer_note: q.buyer_note || q.customer_note,
        admin_note: q.admin_note || q.admin_notes,
        rejection_reason: q.rejection_reason,
        items_count: itemsCount,
        currency_code: q.currency_code,
        expires_at: q.expires_at,
        accepted_at: q.accepted_at,
        rejected_at: q.rejected_at,
        created_cart_id: q.created_cart_id || q.cart_id,
        created_order_id: q.created_order_id || q.order_id,
        created_at: q.created_at,
        updated_at: q.updated_at,
        metadata: q.metadata,
      }
    })

    return res.json({
      quotes,
      count: totalCount,
      offset: skip,
      limit: take,
    })
  } catch (error: any) {
    console.error("[Admin B2B Quotes] List error:", error)

    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to list B2B quotes" })
  }
}