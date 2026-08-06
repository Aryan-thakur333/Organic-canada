import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../modules/b2b"
import { hydrateAdminQuote, PENDING_MERCHANT_STATUSES, statusFromError } from "./utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const {
      status,
      company_id,
      customer_id,
      customer_email,
      q,
      search,
      offset,
      limit,
      order,
    } = req.query as Record<string, string | undefined>

    const filters: Record<string, any> = {}
    if (company_id) filters.company_id = company_id
    if (customer_id) filters.customer_id = customer_id
    if (customer_email) filters.customer_email = customer_email

    const skip = Math.max(0, parseInt(offset || "0", 10) || 0)
    const take = Math.min(Math.max(1, parseInt(limit || "50", 10) || 50), 200)
    const orderBy = order?.startsWith("-")
      ? { [order.slice(1)]: "DESC" }
      : order
        ? { [order]: "ASC" }
        : { created_at: "DESC" }

    const [allQuotes] = await b2bService.listAndCountQuotes(filters, {
      skip: 0,
      take: Math.max(skip + take, 1000),
      order: orderBy,
    })

    const normalizedStatusFilter = status === "pending_merchant"
      ? PENDING_MERCHANT_STATUSES
      : status
        ? [status]
        : null
    const term = String(q || search || "").trim().toLowerCase()

    const filteredQuotes = allQuotes.filter((quote: any) => {
      if (normalizedStatusFilter && !normalizedStatusFilter.includes(quote.status)) {
        return false
      }

      if (!term) {
        return true
      }

      return [
        quote.id,
        quote.company_name,
        quote.customer_email,
        quote.customer_name,
        quote.company_id,
        quote.customer_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })

    const pagedQuotes = filteredQuotes.slice(skip, skip + take)
    const quotes = await Promise.all(pagedQuotes.map((quote: any) => hydrateAdminQuote(req, quote)))

    return res.json({
      quotes,
      count: filteredQuotes.length,
      offset: skip,
      limit: take,
    })
  } catch (error: any) {
    console.error("[Admin B2B Quotes] List error:", error)
    return res.status(statusFromError(error)).json({
      message: error.message || "Failed to list B2B quotes",
    })
  }
}
