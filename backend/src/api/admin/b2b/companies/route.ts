import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../modules/b2b"

/**
 * GET /admin/b2b/companies
 *
 * Lists all registered B2B companies with linked customer info and
 * per-company quote statistics (total, pending, approved, rejected, converted).
 *
 * Query params:
 *   - status  : filter by status (active, inactive, suspended)
 *   - search  : search company_name or tax_id
 *   - offset  : pagination offset (default 0)
 *   - limit   : pagination limit (default 50, max 200)
 *
 * Response:
 * {
 *   companies: Array<{
 *     id, company_name, tax_id, gstin, credit_limit, status,
 *     customer_count: number,
 *     quote_stats: { total, draft, pending, approved, rejected, converted },
 *     primary_admin: { id, email, first_name, last_name } | null,
 *     created_at, updated_at
 *   }>,
 *   count: number,
 *   offset: number,
 *   limit: number
 * }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query = req.scope.resolve("query")
    const b2bService: any = req.scope.resolve(B2B_MODULE)

    const { status, search, offset, limit } = req.query as Record<string, string | undefined>

    const skip = Math.max(0, parseInt(offset || "0", 10) || 0)
    const take = Math.min(Math.max(1, parseInt(limit || "50", 10) || 50), 200)

    // ── 1. Fetch companies via Remote Query with linked customers ───────
    //     Using query.graph to hydrate each company with linked customer info.
    const filters: Record<string, any> = {}
    if (status) filters.status = status

    const { data: hydrated, metadata } = await query.graph({
      entity: "company",
      fields: [
        "id",
        "company_name",
        "tax_id",
        "gstin",
        "credit_limit",
        "status",
        "created_at",
        "updated_at",
        "customer.id",
        "customer.email",
        "customer.first_name",
        "customer.last_name",
      ],
      filters: search
        ? { ...filters, company_name: { $ilike: `%${search}%` } }
        : filters,
      pagination: { skip, take },
    })

    // ── 2. Get per-company quote statistics ──────────────────────────────
    const companyIds = hydrated.map((c: any) => c.id)
    const quoteStatsMap = new Map<string, any>()

    if (companyIds.length > 0) {
      const [allQuotes] = await b2bService.listAndCountQuotes(
        { company_id: companyIds },
        { take: 9999, select: ["id", "company_id", "status"] }
      )

      for (const companyId of companyIds) {
        const companyQuotes = allQuotes.filter((q: any) => q.company_id === companyId)
        quoteStatsMap.set(companyId, {
          total: companyQuotes.length,
          draft: companyQuotes.filter((q: any) => q.status === "draft").length,
          pending: companyQuotes.filter((q: any) => q.status === "pending").length,
          approved: companyQuotes.filter((q: any) => q.status === "approved").length,
          rejected: companyQuotes.filter((q: any) => q.status === "rejected").length,
          converted: companyQuotes.filter((q: any) => q.status === "converted").length,
        })
      }
    }

    // ── 3. Build response ────────────────────────────────────────────────
    const companies = hydrated.map((c: any) => {
      const linkedCustomer = c.customer
        ? Array.isArray(c.customer)
          ? c.customer[0]
          : c.customer
        : null

      return {
        id: c.id,
        company_name: c.company_name,
        tax_id: c.tax_id,
        gstin: c.gstin,
        credit_limit: c.credit_limit,
        status: c.status,
        customer_count: c.customer
          ? Array.isArray(c.customer)
            ? c.customer.length
            : 1
          : 0,
        quote_stats: quoteStatsMap.get(c.id) || {
          total: 0, draft: 0, pending: 0, approved: 0, rejected: 0, converted: 0,
        },
        primary_admin: linkedCustomer
          ? {
              id: linkedCustomer.id,
              email: linkedCustomer.email,
              first_name: linkedCustomer.first_name,
              last_name: linkedCustomer.last_name,
            }
          : null,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }
    })

    return res.json({
      companies,
      count: metadata?.count ?? companies.length,
      offset: skip,
      limit: take,
    })
  } catch (error: any) {
    console.error("[Admin B2B Companies] List error:", error)

    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to list B2B companies" })
  }
}
