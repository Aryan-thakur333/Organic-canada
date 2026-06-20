import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../../../modules/b2b"

/**
 * POST /admin/b2b/companies/:id/status
 *
 * Updates a B2B company's status (active, inactive, suspended).
 * Used by admins to approve new registrations or suspend problematic accounts.
 *
 * Request body:
 * {
 *   "status": "active" | "inactive" | "suspended"
 * }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { status } = req.body as { status?: string }

  // ── 1. Validate ───────────────────────────────────────────────────────
  const VALID_STATUSES = ["active", "inactive", "suspended"]

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `Status is required and must be one of: ${VALID_STATUSES.join(", ")}`,
    })
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)

    // ── 2. Retrieve the company ──────────────────────────────────────────
    const company = await b2bService.retrieveCompany(id)
    if (!company) {
      return res.status(404).json({ message: "B2B company not found" })
    }

    // ── 3. Update the status ────────────────────────────────────────────
    const updated = await b2bService.updateCompanies({
      id,
      status,
    })

    console.log(
      `[Admin B2B Companies] Company ${id} status updated: ${company.status} → ${status}`
    )

    return res.json({
      message: `Company status updated to '${status}'`,
      company: {
        id: updated.id,
        company_name: updated.company_name,
        status: updated.status,
      },
    })
  } catch (error: any) {
    console.error("[Admin B2B Companies] Status update error:", error)

    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to update company status" })
  }
}
