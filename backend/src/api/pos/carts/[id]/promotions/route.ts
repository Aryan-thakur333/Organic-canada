import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../../../../modules/pos"
import { requirePosContext } from "../../../../../utils/pos/security"
import { PosError, posErrorResponse, type PosService } from "../../../../../utils/pos/contracts"

export async function POST(req: MedusaRequest<{ code?: string }>, res: MedusaResponse) {
  try {
    const service = req.scope.resolve(POS_MODULE) as PosService
    const cart = await service.retrievePosOfflineDraft(req.params.id) as Record<string, unknown>
    await requirePosContext(req, String(cart.register_id))
    const code = String(req.body?.code || "").trim()
    if (!code) throw new PosError("POS_VALIDATION_ERROR", "Promotion code is required", 400)
    const promotionService = req.scope.resolve(Modules.PROMOTION)
    const found = (await promotionService.listPromotions({ code }, { take: 1 }))[0]
    if (!found) throw new PosError("POS_VALIDATION_ERROR", "Promotion code is invalid", 422)
    const payload = { ...(cart.payload as Record<string, unknown>), promotion_code: code, promotion_id: found.id }
    const updated = await service.updatePosOfflineDrafts({ id: String(cart.id), payload, cart_id: null, status: "SYNC_PENDING" })
    return res.json({ cart: updated, promotion: { id: found.id, code } })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
