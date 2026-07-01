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
  "contact_name",
  "email",
  "phone",
  "address",
  "created_at",
  "updated_at",
]

function getCustomerId(req: MedusaRequest) {
  return ((req as any).auth_context?.actor_id as string | undefined) ?? null
}

function serializeCompany(company: any) {
  if (!company) {
    return null
  }

  return {
    id: company.id,
    customer_id: company.customer_id ?? null,
    company_name: company.company_name,
    tax_id: company.tax_id ?? null,
    gstin: company.gstin ?? null,
    requested_credit_limit: company.requested_credit_limit ?? 0,
    approved_credit_limit: company.approved_credit_limit ?? null,
    credit_limit: company.credit_limit ?? 0,
    status: company.status,
    approved_at: company.approved_at ?? null,
    rejected_at: company.rejected_at ?? null,
    rejection_reason: company.rejection_reason ?? null,
    admin_note: company.admin_note ?? null,
    contact_name: company.contact_name ?? null,
    email: company.email ?? null,
    phone: company.phone ?? null,
    address: company.address ?? null,
    created_at: company.created_at ?? null,
    updated_at: company.updated_at ?? null,
  }
}

async function listCompaniesSafe(
  service: any,
  filters: Record<string, any>,
  config: Record<string, any> = {}
) {
  if (typeof service.listCompanies === "function") {
    return service.listCompanies(filters, config)
  }

  if (typeof service.listAndCountCompanies === "function") {
    const [companies] = await service.listAndCountCompanies(filters, config)
    return companies
  }

  throw new Error("B2B company list service method is unavailable")
}

async function resolveLinkedCustomerCompany(req: MedusaRequest, customerId: string) {
  const query = req.scope.resolve("query")
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: COMPANY_FIELDS.map((field) => `company.${field}`),
    filters: { id: customerId },
  })

  const customer = customers?.[0]
  const company = Array.isArray(customer?.company)
    ? customer.company[0]
    : customer?.company

  return company ?? null
}

async function getCustomerCompanies(req: MedusaRequest, customerId: string) {
  const b2bService: any = req.scope.resolve(B2B_MODULE)

  try {
    return await listCompaniesSafe(
      b2bService,
      { customer_id: customerId },
      {
        take: 10,
        order: { created_at: "DESC" },
        select: COMPANY_FIELDS,
      }
    )
  } catch (error: any) {
    console.warn("[B2B Company] Direct company lookup failed, trying linked customer lookup:", error?.message)
    const linked = await resolveLinkedCustomerCompany(req, customerId)
    return linked ? [linked] : []
  }
}

async function getLatestCustomerCompany(req: MedusaRequest, customerId: string) {
  const companies = await getCustomerCompanies(req, customerId)
  return companies?.[0] ?? null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerId = getCustomerId(req)

    if (!customerId) {
      return res.status(401).json({ message: "Customer login required" })
    }

    const company = await getLatestCustomerCompany(req, customerId)
    return res.json({ company: serializeCompany(company) })
  } catch (error: any) {
    console.error("[B2B GET] Error:", error)
    return res.status(500).json({
      message: "Unable to load B2B application status. Please try again.",
    })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { company_name, tax_id, requested_credit_limit } = req.body as any
  const normalizedName = typeof company_name === "string" ? company_name.trim() : ""

  if (!normalizedName) {
    return res.status(400).json({ message: "Company name is required" })
  }

  if (
    requested_credit_limit !== undefined &&
    requested_credit_limit !== null &&
    requested_credit_limit !== "" &&
    (Number.isNaN(Number(requested_credit_limit)) || Number(requested_credit_limit) < 0)
  ) {
    return res.status(400).json({ message: "requested_credit_limit must be a non-negative number" })
  }

  try {
    const customerId = getCustomerId(req)

    if (!customerId) {
      return res.status(401).json({ message: "Customer login required" })
    }

    const b2bService = req.scope.resolve(B2B_MODULE) as any
    const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
    const remoteLink = req.scope.resolve("remoteLink")
    const customer = await customerModule.retrieveCustomer(customerId)

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" })
    }

    const existingCompanies = await getCustomerCompanies(req, customerId)
    const pendingCompany = existingCompanies.find((c: any) => c.status === "pending")
    const approvedCompany = existingCompanies.find((c: any) => c.status === "approved" || c.status === "active")
    const rejectedCompany = existingCompanies.find((c: any) => c.status === "rejected")

    if (approvedCompany) {
      return res.json({
        message: "B2B access approved.",
        company: serializeCompany(approvedCompany),
      })
    }

    const requestedCents =
      requested_credit_limit !== undefined && requested_credit_limit !== null && requested_credit_limit !== ""
        ? Math.round(Number(requested_credit_limit) * 100)
        : 0

    const companyToUpdate = pendingCompany || rejectedCompany
    if (companyToUpdate) {
      const updated = await b2bService.updateCompanies({
        id: companyToUpdate.id,
        company_name: normalizedName,
        tax_id: tax_id?.trim?.() || null,
        requested_credit_limit: requestedCents,
        status: "pending",
        rejected_at: null,
        rejection_reason: null,
      })

      return res.json({
        message: pendingCompany
          ? "Waiting for admin approval."
          : "B2B application submitted for admin approval.",
        company: serializeCompany(updated),
      })
    }

    const company = await b2bService.createCompanies({
      company_name: normalizedName,
      tax_id: tax_id?.trim?.() || null,
      customer_id: customerId,
      requested_credit_limit: requestedCents,
      status: "pending",
      contact_name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
      email: customer.email,
      phone: customer.phone || null,
    })

    try {
      await remoteLink.create({
        [B2B_MODULE]: { company_id: company.id },
        [Modules.CUSTOMER]: { customer_id: customer.id },
      })
    } catch (error: any) {
      const message = String(error?.message || error)
      if (!/already exists|duplicate/i.test(message)) {
        console.warn("[B2B Company] Company/customer remote link was not created:", message)
      }
    }

    try {
      await b2bService.createCompanyMembers({
        company_id: company.id,
        customer_id: customer.id,
        role: "admin",
        status: "active",
      })
    } catch (error: any) {
      const message = String(error?.message || error)
      if (!/already exists|duplicate/i.test(message)) {
        console.warn("[B2B Company] Company member record was not created:", message)
      }
    }

    console.log(`[B2B Company] Created pending application ${company.id} for customer ${customer.email}`)

    return res.status(201).json({
      message: "B2B application submitted for admin approval.",
      company: serializeCompany(company),
    })
  } catch (error: any) {
    if (error instanceof MedusaError) {
      const status = error.type === "not_found" ? 404 : 400
      return res.status(status).json({ message: error.message })
    }

    console.error("[B2B Company Onboarding] Error:", error)
    return res.status(500).json({ message: "Failed to register B2B company" })
  }
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerId = getCustomerId(req)

    if (!customerId) {
      return res.status(401).json({ message: "Customer login required" })
    }

    const company = await getLatestCustomerCompany(req, customerId)

    if (!company) {
      return res.status(404).json({ message: "No B2B company found for your account" })
    }

    const { company_name, tax_id, contact_name, email, phone, address } = req.body as any
    const updatePayload: Record<string, any> = { id: company.id }

    if (company_name !== undefined) {
      const normalizedName = String(company_name).trim()
      if (!normalizedName) {
        return res.status(400).json({ message: "company_name cannot be empty" })
      }
      updatePayload.company_name = normalizedName
    }

    if (tax_id !== undefined) updatePayload.tax_id = tax_id?.trim?.() || null
    if (contact_name !== undefined) updatePayload.contact_name = contact_name?.trim?.() || null
    if (email !== undefined) updatePayload.email = email?.trim?.() || null
    if (phone !== undefined) updatePayload.phone = phone?.trim?.() || null
    if (address !== undefined) updatePayload.address = address || null

    if (Object.keys(updatePayload).length <= 1) {
      return res.status(400).json({ message: "No fields to update" })
    }

    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const updated = await b2bService.updateCompanies(updatePayload)

    return res.json({
      message: "Company updated successfully",
      company: serializeCompany(updated),
    })
  } catch (error: any) {
    console.error("[B2B Company Update] Error:", error)

    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to update company" })
  }
}
