import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../../../modules/b2b"

/**
 * POST /admin/b2b/companies/:id/suspend
 *
 * Suspends an approved/active B2B company.
 *
 * Request body:
 * {
 *   "admin_note": "Account suspended due to payment issues"
 * }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { admin_note } = req.body as { admin_note?: string }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)

    // ── 1. Retrieve the company ──────────────────────────────────────────
    const company = await b2bService.retrieveCompany(id)
    if (!company) {
      return res.status(404).json({ message: "B2B company not found" })
    }

    if (company.status === "suspended") {
      return res.status(400).json({ message: "Company is already suspended" })
    }

    if (company.status === "pending") {
      return res.status(400).json({ message: "Cannot suspend a pending application. Reject it instead." })
    }

    const authContext = (req as any).auth_context
    const adminUserId = authContext?.actor_id || "system"

    // ── 2. Update company to suspended status ────────────────────────────
    const updated = await b2bService.updateCompanies({
      id,
      status: "suspended",
      admin_note: admin_note || company.admin_note || null,
    })

    console.log(
      `[Admin B2B Suspend] Company ${id} suspended by ${adminUserId}. Note: ${admin_note || "N/A"}`
    )

    return res.json({
      message: "Company suspended.",
      company: {
        id: updated.id,
        company_name: updated.company_name,
        status: "suspended",
        admin_note: admin_note || null,
      },
    })
  } catch (error: any) {
    console.error("[Admin B2B Suspend] Error:", error)
    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }
    return res.status(500).json({ message: error.message || "Failed to suspend company" })
  }
}
