import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../modules/b2b"
import { Modules, MedusaError } from "@medusajs/framework/utils"

// ── Helper: resolve company for the authenticated customer ────────────────

async function resolveCustomerCompany(req: MedusaRequest) {
  const query = req.scope.resolve("query")
  const authContext = (req as any).auth_context
  const customerId: string | null = authContext?.actor_id ?? null

  if (!customerId) {
    return { customerId: null, company: null }
  }

  const { data: customers } = await query.graph({
    entity: "customer",
    fields: [
      "company.id",
      "company.company_name",
      "company.tax_id",
      "company.gstin",
      "company.credit_limit",
      "company.status",
      "company.contact_name",
      "company.email",
      "company.phone",
      "company.address",
    ],
    filters: { id: customerId },
  })

  const customer = customers?.[0]
  return { customerId, company: customer?.company ?? null }
}

/**
 * GET /store/b2b/company
 *
 * Returns the B2B company linked to the authenticated customer.
 * Used by the frontend useB2BCompany() hook to hydrate checkout UI.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { customerId, company } = await resolveCustomerCompany(req)

    if (!customerId) {
      return res.status(401).json({ message: "Authentication required" })
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
  const { company_name, tax_id, contact_name, email, phone, address } = req.body as any
  const credit_limit = 0

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
      contact_name: contact_name || [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
      email: email || customer.email,
      phone: phone || customer.phone || null,
      address: address || null,
      credit_limit: credit_limit ?? 0,
      status: "active",
    })

    // ── 3. Link the Company to the Customer (admin) ──────────────────────
    //    This leverages the defineLink between Company and Customer
    await remoteLink.create({
      [B2B_MODULE]: { company_id: company.id },
      [Modules.CUSTOMER]: { customer_id: customer.id },
    })
    await b2bService.createCompanyMembers({ company_id: company.id, customer_id: customer.id, role: "admin", status: "active" })

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

/**
 * PATCH /store/b2b/company
 *
 * Updates the authenticated customer's B2B company details.
 * The customer must have a linked, active company.
 *
 * Request body (all fields optional):
 * {
 *   "company_name": "Acme Corp (Updated)",
 *   "tax_id": "DE987654321",
 *   "credit_limit": 100000
 * }
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { customerId, company } = await resolveCustomerCompany(req)

    if (!customerId) {
      return res.status(401).json({ message: "Authentication required" })
    }

    if (!company) {
      return res.status(404).json({ message: "No B2B company found for your account" })
    }

    const { company_name, tax_id, contact_name, email, phone, address } = req.body as any

    const updatePayload: Record<string, any> = { id: company.id }

    if (company_name !== undefined) {
      if (!company_name.trim()) {
        return res.status(400).json({ message: "company_name cannot be empty" })
      }
      updatePayload.company_name = company_name.trim()
    }

    if (tax_id !== undefined) {
      updatePayload.tax_id = tax_id?.trim() || null
    }
    if (contact_name !== undefined) updatePayload.contact_name = contact_name?.trim() || null
    if (email !== undefined) updatePayload.email = email?.trim() || null
    if (phone !== undefined) updatePayload.phone = phone?.trim() || null
    if (address !== undefined) updatePayload.address = address || null

    if (Object.keys(updatePayload).length <= 1) {
      return res.status(400).json({ message: "No fields to update" })
    }

    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const updated = await b2bService.updateCompanies(updatePayload)

    console.log(
      `[B2B Company] Updated ${company.id}: ${JSON.stringify(Object.keys(updatePayload).filter(k => k !== 'id'))}`
    )

    return res.json({
      message: "Company updated successfully",
      company: {
        id: updated.id,
        company_name: updated.company_name,
        tax_id: updated.tax_id,
        gstin: updated.gstin,
        credit_limit: updated.credit_limit,
        status: updated.status,
      },
    })
  } catch (error: any) {
    console.error("[B2B Company Update] Error:", error)

    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to update company" })
  }
}
