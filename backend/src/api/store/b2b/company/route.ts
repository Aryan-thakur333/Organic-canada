import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../modules/b2b"
import { Modules, MedusaError } from "@medusajs/framework/utils"

/**
 * GET /store/b2b/company
 *
 * Returns the B2B company linked to the authenticated customer.
 * Used by the frontend useB2BCompany() hook to hydrate checkout UI.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query = req.scope.resolve("query")
    const authContext = (req as any).auth_context
    const customerId: string | null = authContext?.actor_id ?? null

    if (!customerId) {
      return res.status(401).json({ message: "Authentication required" })
    }

    // Query the customer→company link graph.
    // The defineLink(Company, Customer) creates a bidirectional relationship.
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: [
        "company.id",
        "company.company_name",
        "company.tax_id",
        "company.credit_limit",
        "company.status",
      ],
      filters: { id: customerId },
    })

    const customer = customers?.[0]
    const company = customer?.company ?? null

    if (!company) {
      return res.json({ company: null })
    }

    return res.json({ company })
  } catch (error: any) {
    console.error("[B2B GET] Error:", error)
    return res.status(500).json({ message: error.message })
  }
}

/**
 * POST /store/b2b/company
 *
 * Onboards a new B2B company and links the authenticated customer
 * as the primary administrator.
 *
 * Request body:
 * {
 *   "company_name": "Acme Corp",
 *   "tax_id": "DE123456789",
 *   "credit_limit": 50000,        // €500.00 in cents (optional, default 0)
 *   "customer_email": "admin@acme.com"  // optional, defaults to auth identity
 * }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { company_name, tax_id, credit_limit } = req.body as {
    company_name?: string
    tax_id?: string
    credit_limit?: number
  }

  if (!company_name) {
    return res.status(400).json({
      message: "company_name is required",
    })
  }

  try {
    const b2bService = req.scope.resolve(B2B_MODULE) as any
    const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
    const remoteLink = req.scope.resolve("remoteLink")

    // ── 1. Resolve the authenticated customer ────────────────────────────
    //    Medusa v2 attaches the auth_identity to req.auth_context
    const authContext = (req as any).auth_context
    let customerId: string | null = null

    if (authContext?.actor_id) {
      customerId = authContext.actor_id
    }

    // Fallback: if auth_context is not populated, check for a customer_id in the body
    if (!customerId && (req.body as any).customer_id) {
      customerId = (req.body as any).customer_id
    }

    if (!customerId) {
      return res.status(401).json({
        message:
          "Authentication required. Register or log in as a customer first.",
      })
    }

    // Verify the customer exists
    const customer = await customerModule.retrieveCustomer(customerId)
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" })
    }

    // ── 2. Create the Company ────────────────────────────────────────────
    const company = await b2bService.createCompanies({
      company_name,
      tax_id: tax_id || null,
      credit_limit: credit_limit ?? 0,
      status: "active",
    })

    // ── 3. Link the Company to the Customer (admin) ──────────────────────
    //    This leverages the defineLink between Company and Customer
    await remoteLink.create({
      [B2B_MODULE]: { company_id: company.id },
      [Modules.CUSTOMER]: { customer_id: customer.id },
    })

    // ── 4. Response ─────────────────────────────────────────────────────
    res.status(201).json({
      message: "B2B company registered successfully",
      company: {
        id: company.id,
        company_name: company.company_name,
        tax_id: company.tax_id,
        credit_limit: company.credit_limit,
        status: company.status,
        primary_admin: {
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
        },
      },
    })
  } catch (error: any) {
    if (error instanceof MedusaError) {
      const status = error.type === "not_found" ? 404 : 400
      return res.status(status).json({
        message: error.message,
      })
    }
    console.error("[B2B Company Onboarding] Error:", error)
    return res.status(500).json({
      message: error.message || "Failed to register B2B company",
    })
  }
}
