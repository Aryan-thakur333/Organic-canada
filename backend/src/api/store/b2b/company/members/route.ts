import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../../modules/b2b"

/**
 * GET /store/b2b/company/members
 *
 * Returns all customer team members linked to the authenticated customer's
 * B2B company. The authenticated customer must belong to a company.
 *
 * This traverses the defineLink(Company, Customer) bidirectional graph:
 *   Auth Customer → Company → All linked Customers
 *
 * Response:
 * {
 *   members: Array<{
 *     id: string,
 *     email: string,
 *     first_name: string | null,
 *     last_name: string | null,
 *     phone: string | null,
 *     is_you: boolean,
 *   }>
 * }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query = req.scope.resolve("query")
    const authContext = (req as any).auth_context
    const customerId: string | null = authContext?.actor_id ?? null

    if (!customerId) {
      return res.status(401).json({ message: "Authentication required" })
    }

    // ── 1. Resolve the customer's company via the link graph ─────────────
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: [
        "company.id",
        "company.company_name",
      ],
      filters: { id: customerId },
    })

    const company = customers?.[0]?.company ?? null

    if (!company) {
      return res.json({ members: [] })
    }

    // ── 2. Traverse the reverse link: Company → all linked Customers ────
    //     Medusa's defineLink creates a bidirectional relationship,
    //     so we can query from company → customer.
    const { data: companyWithCustomers } = await query.graph({
      entity: "company",
      fields: [
        "id",
        "company_name",
        "customer.id",
        "customer.email",
        "customer.first_name",
        "customer.last_name",
        "customer.phone",
      ],
      filters: { id: company.id },
    })

    // The link may return one or many linked customers
    const linkedData = companyWithCustomers?.[0]?.customer
    const linkedCustomers = linkedData
      ? Array.isArray(linkedData) ? linkedData : [linkedData]
      : []

    const members = linkedCustomers.map((c: any) => ({
      id: c.id,
      email: c.email,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      is_you: c.id === customerId,
    }))

    console.log(
      `[B2B Members] Company ${company.id} has ${members.length} member(s)`
    )

    return res.json({
      members,
      company_name: companyWithCustomers?.[0]?.company_name || company.company_name,
    })
  } catch (error: any) {
    console.error("[B2B Members] List error:", error)
    return res.status(500).json({ message: error.message || "Failed to list company members" })
  }
}
