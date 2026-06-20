import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../modules/b2b"

// ────────────────────────────────────────────────────────────────────────────
//  GET /admin/b2b-quotes/:id
//
//  Retrieves a single B2B wholesale quote hydrated with the linked Company
//  details via Medusa's Remote Query framework.
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const query = req.scope.resolve("query")

    // ── 1. Retrieve the quote via the module service ────────────────────
    const quote = await b2bService.retrieveQuote(id)
    if (!quote) {
      return res.status(404).json({ message: "B2B quote not found" })
    }

    // ── 2. Hydrate linked company data via Remote Query ─────────────────
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
      filters: { id: quote.id },
    })

    const company = hydrated?.[0]?.company || null

    return res.json({
      quote: {
        id: quote.id,
        company_id: quote.company_id,
        customer_id: quote.customer_id,
        customer_email: quote.customer_email,
        status: quote.status,
        items: quote.items,
        subtotal: quote.subtotal,
        negotiated_total: quote.negotiated_total,
        admin_notes: quote.admin_notes,
        metadata: quote.metadata,
        company,
        created_at: quote.created_at,
        updated_at: quote.updated_at,
      },
    })
  } catch (error: any) {
    console.error("[Admin B2B Quotes] Retrieve error:", error)

    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to retrieve B2B quote" })
  }
}
