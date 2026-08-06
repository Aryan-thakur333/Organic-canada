import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOpenRegisterSession, requirePosContext } from "../../../../../utils/pos/security"
import { posErrorResponse } from "../../../../../utils/pos/contracts"

export function normalizeRegisterId(value: unknown) {
  return String(value || "").trim()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
  const rawParam = req.params.id
  const registerId = normalizeRegisterId(rawParam)
  try {
    if (process.env.NODE_ENV !== "production") {
      logger.info(`[POS_SESSION_REGISTER_PARAM] ${JSON.stringify({
        rawParam: String(rawParam || ""),
        normalizedRegisterId: registerId,
      })}`)
    }
    const context = await requirePosContext(req, registerId)
    const session = await getOpenRegisterSession(context.service, registerId, context.operatorId)
    if (process.env.NODE_ENV !== "production") {
      logger.info(`[POS_SESSION_REUSE_TRACE] ${JSON.stringify({
        authorizationPassed: true,
        openSessionsFound: session ? 1 : 0,
        matchingUsaSessionFound: Boolean(session && session.register_id === registerId && session.operator_id === context.operatorId),
        sessionId: String(session?.id || ""),
        newSessionCreated: false,
        wrongRegisterSessionReturned: Boolean(session && session.register_id !== registerId),
        passed: Boolean(session && session.register_id === registerId && session.operator_id === context.operatorId),
      })}`)
    }
    return res.json({ session })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
