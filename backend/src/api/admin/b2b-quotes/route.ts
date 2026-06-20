import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../modules/b2b"

// ────────────────────────────────────────────────────────────────────────────
//  GET /admin/b2b-quotes
//
//  Lists all B2B wholesale draft quotes with optional status filtering.
//  Uses Medusa's Remote Query framework (`query.graph`) to hydrate each
//  quote with the linked Company details (corporate customer name, tax ID).
//
//  Query params:
//    - status    : filter by status (draft, pending, approved, rejected, converted)
//    - company_id: filter by company
//    - offset    : pagination offset (default 0)
//    - limit     : pagination limit (default 50, max 200)
//
//  Response shape:
//    {
//      quotes: Array<{
//        id, company_id, customer_id, customer_email, status,
//        items, subtotal, negotiated_total, admin_notes,
//        company: { company_name, tax_id, credit_limit },
//        created_at, updated_at
//      }>,
//      count: number,
//      offset: number,
//      limit: number
//    }
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query = req.scope.resolve("query")
    const b2bService: any = req.scope.resolve(B2B_MODULE)

    const { status, company_id, offset, limit } = req.query as Record<string, string | undefined>

    // ── 1. Build query filters ──────────────────────────────────────────
    const filters: Record<string, any> = {}
    if (status) filters.status = status
    if (company_id) filters.company_id = company_id

    const skip = Math.max(0, parseInt(offset || "0", 10) || 0)
    const take = Math.min(Math.max(1, parseInt(limit || "50", 10) || 50), 200)

    // ── 2. Count total matching quotes (for pagination) ─────────────────
    const [allQuotes, totalCount] = await b2bService.listAndCountQuotes(filters, {
      skip,
      take,
      order: { created_at: "DESC" },
    })

    // ── 3. Hydrate each quote with linked Company data via Remote Query ─
    //      The defineLink(Quote, Company) enables this graph traversal.
    const quoteIds = allQuotes.map((q: any) => q.id)

    const companyMap = new Map<string, any>()

    if (quoteIds.length > 0) {
      const { data: hydrated } = await query.graph({
        entity: "b2b_quote",
        fields: [
          "id",
          "company.id",
          "company.company_name",
          "company.tax_id",
          "company.gstin",
          "company.credit_limit",
          "company.status",
        ],
        filters: { id: quoteIds },
      })

      for (const row of hydrated) {
        if (row.company) {
          companyMap.set(row.id, row.company)
        }
      }
    }

    // ── 4. Merge company data into quote response ───────────────────────
    const quotes = allQuotes.map((q: any) => ({
      id: q.id,
      company_id: q.company_id,
      customer_id: q.customer_id,
      customer_email: q.customer_email,
      status: q.status,
      items: q.items,
      subtotal: q.subtotal,
      negotiated_total: q.negotiated_total,
      admin_notes: q.admin_notes,
      company: companyMap.get(q.id) || null,
      created_at: q.created_at,
      updated_at: q.updated_at,
    }))

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
