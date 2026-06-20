import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

// GET /admin/coupons — list all promotions with usage stats
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const promotionService: any = req.scope.resolve(Modules.PROMOTION)
    const promotions = await promotionService.listPromotions(
      {},
      { relations: ["application_method"], order: { created_at: "DESC" } }
    )
    return res.json({ promotions })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to list promotions" })
  }
}
