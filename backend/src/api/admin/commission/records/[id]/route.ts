import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COMMISSION_MODULE } from "../../../../../modules/commission"

/**
 * PATCH /admin/commission/records/:id
 * Manually adjust a commission record.
 * 
 * Body parameters:
 *   adjusted_commission_amount (number) - The new adjusted commission amount (in minor units)
 *   reason (string) - Reason for the adjustment
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  try {
    const commissionService: any = req.scope.resolve(COMMISSION_MODULE)
    const { id } = req.params as { id: string }
    const body = req.body as any

    // Retrieve existing record to ensure it exists
    let record
    try {
      record = await commissionService.retrieveCommissionRecord(id)
    } catch (e) {
      return res.status(404).json({ message: `Commission record with id ${id} not found.` })
    }

    const { adjusted_commission_amount, reason } = body

    if (adjusted_commission_amount === undefined || adjusted_commission_amount === null) {
      return res.status(400).json({ message: "adjusted_commission_amount is required." })
    }
    
    if (typeof adjusted_commission_amount !== "number" || isNaN(adjusted_commission_amount) || adjusted_commission_amount < 0) {
      return res.status(400).json({ message: "adjusted_commission_amount must be a valid non-negative number." })
    }

    if (!reason || typeof reason !== "string" || reason.trim() === "") {
      return res.status(400).json({ message: "reason is required and cannot be empty." })
    }

    // Try to get auth context for adjusted_by
    const authContext = (req as any).auth_context
    const actorId = authContext?.actor_id || "admin"

    const updated = await commissionService.updateCommissionRecords({
      id,
      adjusted_commission_amount: Math.round(adjusted_commission_amount),
      adjustment_reason: reason.trim(),
      adjusted_at: new Date().toISOString(),
      adjusted_by: actorId
    })

    return res.json({ record: updated })
  } catch (error: any) {
    console.error(`[Admin Commission Records] PATCH /:id error:`, error)
    return res.status(500).json({ message: "An unexpected error occurred while updating the commission record." })
  }
}
