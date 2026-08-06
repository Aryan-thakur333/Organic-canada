import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { appendPosAudit, openPosRegisterSession, requirePosContext } from "../../../../../utils/pos/security"
import { integerMinor, posErrorResponse } from "../../../../../utils/pos/contracts"

export async function POST(req: MedusaRequest<{ opening_cash_minor?: number }>, res: MedusaResponse) {
  const registerId = String(req.params.id || "").trim()
  try {
    const context = await requirePosContext(req, registerId)
    const amount = integerMinor(req.body?.opening_cash_minor, "opening_cash_minor")
    const result = await openPosRegisterSession(context.service, context.register!, context.operatorId, amount)
    if (!result.created) return res.status(200).json({ session: result.session, idempotent: true })
    await context.service.createPosCashMovements({ register_session_id: result.session.id, operator_id: context.operatorId, movement_type: "OPENING_FLOAT", amount_minor: amount, reason: "Register opening", metadata: null })
    await appendPosAudit(context.service, { register_id: registerId, session_id: result.session.id, operator_id: context.operatorId, event_type: "POS_SESSION_OPENED", message: "Register session opened", metadata: { opening_cash_minor: amount } })
    return res.status(201).json({ session: result.session, idempotent: false })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
