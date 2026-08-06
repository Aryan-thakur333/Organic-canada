import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveCurrentPosContext, sanitizeRegister, sanitizeSession } from "../../../../utils/pos/security"
import { posErrorResponse } from "../../../../utils/pos/contracts"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store, private")
  try {
    const context = await resolveCurrentPosContext(req)
    const session = context.session
    if (!session) return res.json({ session: null, register: null })
    const register = context.activeRegister
    const serializedRegister = sanitizeRegister(register)
    const serializedSession = sanitizeSession(session)

    return res.json({
      session: { ...serializedSession!, register: serializedRegister },
      register: serializedRegister,
    })
  } catch (error) {
    const response = posErrorResponse(error)
    return res.status(response.status).json(response.body)
  }
}
