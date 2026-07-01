import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../modules/b2b"
import { MedusaError, Modules } from "@medusajs/framework/utils"

const COMPANY_FIELDS = [
  "id",
  "company_name",
  "tax_id",
  "gstin",
  "credit_limit",
  "requested_credit_limit",
  "approved_credit_limit",
  "customer_id",
  "approved_by",
  "approved_at",
  "rejected_at",
  "rejection_reason",
  "admin_note",
  "status",
  "created_at",
  "updated_at",
]

async function listCompaniesSafe(
  service: any,
  filters: Record<string, any>,
  config: Record<string, any>
) {
  if (typeof service.listCompanies === "function") {
    const companies = await service.listCompanies(filters, config)
    return [companies, companies.length] as [any[], number]
  }

  if (typeof service.listAndCountCompanies === "function") {
    return service.listAndCountCompanies(filters, config)
  }

  throw new Error("B2B company list service method is unavailable")
}

async function getCustomerEmail(customerModule: any, customerId?: string | null) {
  if (!customerId) {
    return null
  }

  try {
    const customer = await customerModule.retrieveCustomer(customerId)
    return customer?.email ?? null
  } catch {
    return null
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const customerModule: any = req.scope.resolve(Modules.CUSTOMER)
    const { status, search, offset, limit } = req.query as Record<string, string | undefined>

    const skip = Math.max(0, parseInt(offset || "0", 10) || 0)
    const take = Math.min(Math.max(1, parseInt(limit || "50", 10) || 50), 200)
    const filters: Record<string, any> = {}

    if (status) {
      filters.status = status
    }

    if (search) {
      filters.company_name = { $ilike: `%${search}%` }
    }

    const [rows, count] = await listCompaniesSafe(b2bService, filters, {
      skip,
      take,
      order: { created_at: "DESC" },
      select: COMPANY_FIELDS,
    })

    const companies = await Promise.all(
      rows.map(async (company: any) => ({
        id: company.id,
        company_name: company.company_name,
        customer_id: company.customer_id ?? null,
        customer_email: await getCustomerEmail(customerModule, company.customer_id),
        tax_id: company.tax_id ?? null,
        gstin: company.gstin ?? null,
        credit_limit: company.credit_limit ?? 0,
        requested_credit_limit: company.requested_credit_limit ?? 0,
        approved_credit_limit: company.approved_credit_limit ?? null,
        status: company.status,
        created_at: company.created_at ?? null,
        updated_at: company.updated_at ?? null,
        approved_at: company.approved_at ?? null,
        approved_by: company.approved_by ?? null,
        rejected_at: company.rejected_at ?? null,
        rejection_reason: company.rejection_reason ?? null,
        admin_note: company.admin_note ?? null,
      }))
    )

    return res.json({
      companies,
      count,
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
