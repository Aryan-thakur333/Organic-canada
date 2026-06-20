import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

// PATCH /admin/coupons/:id — toggle status (active/draft)
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { status } = req.body as any

  if (!["active", "draft"].includes(status)) {
    return res.status(400).json({ message: "Status must be 'active' or 'draft'" })
  }

  try {
    const promotionService: any = req.scope.resolve(Modules.PROMOTION)
    const updated = await promotionService.updatePromotions({ id, status })
    return res.json({ promotion: updated })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to update promotion" })
  }
}
