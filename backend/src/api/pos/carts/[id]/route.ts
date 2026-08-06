import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { POS_MODULE } from "../../../../modules/pos"
import { requirePosContext } from "../../../../utils/pos/security"
import { PosError, posErrorResponse, type PosService } from "../../../../utils/pos/contracts"

async function owned(req: MedusaRequest) {
  const service = req.scope.resolve(POS_MODULE) as PosService
  const cart = await service.retrievePosOfflineDraft(req.params.id) as Record<string, unknown>
  const context = await requirePosContext(req, String(cart.register_id))
  if (cart.operator_id !== context.operatorId && context.role === "POS_OPERATOR") {
    throw new PosError("POS_UNAUTHORIZED", "Cart belongs to another operator", 403)
  }
  return { service, cart, context }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    return res.json({ cart: (await owned(req)).cart })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}

export async function POST(req: MedusaRequest<Record<string, unknown>>, res: MedusaResponse) {
  try {
    const current = await owned(req)
    if (["SYNCED", "VOIDED"].includes(String(current.cart.status))) {
      throw new PosError("POS_INVALID_TRANSITION", "Completed or voided cart cannot be changed", 409)
    }
    const payload = { ...(current.cart.payload as Record<string, unknown>), ...req.body }
    const cart = await current.service.updatePosOfflineDrafts({
      id: current.cart.id,
      payload,
      cart_id: null,
      status: "SYNC_PENDING",
      metadata: {
        ...((current.cart.metadata as Record<string, unknown>) || {}),
        sync_status: "PENDING_VALIDATION",
        updated_offline_at: new Date().toISOString(),
      },
    })
    return res.json({ cart })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  try {
    const current = await owned(req)
    const cart = await current.service.updatePosOfflineDrafts({ id: current.cart.id, status: "VOIDED" })
    return res.json({ cart })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
