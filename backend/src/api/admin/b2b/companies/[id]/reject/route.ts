import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../../../modules/b2b"

/**
 * POST /admin/b2b/companies/:id/reject
 *
 * Rejects a pending B2B company application.
 *
 * Request body:
 * {
 *   "reason": "Invalid tax information provided",
 *   "admin_note": "Please resubmit with correct documentation"
 * }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { reason, admin_note } = req.body as {
    reason?: string
    admin_note?: string
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)

    // ── 1. Retrieve the company ──────────────────────────────────────────
    const company = await b2bService.retrieveCompany(id)
    if (!company) {
      return res.status(404).json({ message: "B2B company not found" })
    }

    if (company.status === "rejected") {
      return res.status(400).json({ message: "Company is already rejected" })
    }

    if (company.status === "approved" || company.status === "active") {
      return res.status(400).json({ message: "Cannot reject an approved company. Use suspend instead." })
    }

    const authContext = (req as any).auth_context
    const adminUserId = authContext?.actor_id || "system"

    // ── 2. Update company to rejected status ─────────────────────────────
    const updated = await b2bService.updateCompanies({
      id,
      status: "rejected",
      rejected_at: new Date(),
      rejection_reason: reason || null,
      admin_note: admin_note || null,
      approved_by: adminUserId,
    })

    console.log(
      `[Admin B2B Reject] Company ${id} rejected by ${adminUserId}. Reason: ${reason || "Not specified"}`
    )

    return res.json({
      message: "Company application rejected.",
      company: {
        id: updated.id,
        company_name: updated.company_name,
        status: "rejected",
        rejection_reason: reason || null,
        admin_note: admin_note || null,
      },
    })
  } catch (error: any) {
    console.error("[Admin B2B Reject] Error:", error)
    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }
    return res.status(500).json({ message: error.message || "Failed to reject company" })
  }
}
