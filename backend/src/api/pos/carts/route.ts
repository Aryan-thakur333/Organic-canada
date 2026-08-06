import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { randomUUID } from "crypto"
import { resolveCurrentPosContext } from "../../../utils/pos/security"
import { PosError, posErrorResponse } from "../../../utils/pos/contracts"

export async function POST(req: MedusaRequest<Record<string, unknown>>, res: MedusaResponse) {
  try {
    const registerId = String(req.body?.register_id || "")
    if (!registerId) throw new PosError("POS_VALIDATION_ERROR", "register_id is required", 400)
    const context = await resolveCurrentPosContext(req, registerId)
    const session = context.session
    if (!session) throw new PosError("POS_REGISTER_SESSION_REQUIRED", "Your register session is no longer active. Select or reopen a register.", 409)
    const clientUuid = String(req.body?.client_uuid || randomUUID())
    const idempotency = String(req.body?.idempotency_key || `pos-draft:${clientUuid}`)
    const existing = await context.service.listPosOfflineDrafts({ client_uuid: clientUuid }) as unknown[]
    if (existing.length) return res.json({ cart: existing[0], reused: true })
    const now = new Date().toISOString()
    const cart = await context.service.createPosOfflineDrafts({
      client_uuid: clientUuid, register_id: registerId, session_id: session.id, operator_id: context.operatorId,
      region_id: context.activeRegister?.region_id, currency_code: context.activeRegister?.currency_code,
      status: "LOCAL_DRAFT", idempotency_key: idempotency,
      payload: { items: [], customer_id: null, guest_email: null, notes: null, fulfillment_type: "IMMEDIATE_CARRYOUT" },
      metadata: { sync_status: "LOCAL_ONLY", created_offline_at: now, payment_allowed_offline: false },
    })
    return res.status(201).json({ cart, reused: false })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
