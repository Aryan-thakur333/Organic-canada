import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadRegister, normalizePosLookupCode, resolvePosVariant } from "../../../utils/pos/catalog"
import { PosError, posErrorResponse } from "../../../utils/pos/contracts"
import { resolveCurrentPosContext } from "../../../utils/pos/security"

type ScanBody = {
  register_id?: string
  code?: string
}

export async function POST(req: MedusaRequest<ScanBody>, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as {
    info(message: string): void
    warn(message: string): void
  }
  let codeLength = 0

  try {
    const registerId = String(req.body?.register_id || "").trim()
    if (!registerId || registerId.length > 128) {
      throw new PosError("POS_REGISTER_ID_MISSING", "A valid register_id is required", 400)
    }

    const code = normalizePosLookupCode(req.body?.code)
    codeLength = code.length

    const request = req as MedusaRequest<ScanBody> & { auth_context?: { actor_id?: string } }
    const actorId = String(request.auth_context?.actor_id || "")
    const operator = await resolveCurrentPosContext(req, registerId)
    const assignedRegisterIds = operator.assignedRegisters.map((register) => register.id)
    const currentSession = operator.session

    if (process.env.NODE_ENV !== "production") {
      logger.info(`[POS_REGISTER_AUTH_DEBUG] ${JSON.stringify({
        actorId,
        operatorId: operator.operatorId,
        requestedRegisterId: registerId,
        sessionRegisterId: String(currentSession?.register_id || ""),
        assignedRegisterIds,
      })}`)
    }

    if (!currentSession) throw new PosError("POS_REGISTER_SESSION_REQUIRED", "Open a register session before scanning products.", 409)

    const register = await loadRegister(req, registerId)
    const product = await resolvePosVariant(req, register, code, { throwOnOutOfStock: false })

    logger.info(`[POS_SCAN_SUCCESS] ${JSON.stringify({
      operator_id: operator.operatorId,
      register_id: registerId,
      product_id: product.product_id,
      variant_id: product.variant_id,
      code_length: codeLength,
      sales_channel_id: product.commercial_context?.sales_channel_id,
      stock_location_id: product.inventory?.stock_location_id,
      currency_code: product.price?.currency_code,
    })}`)

    return res.status(200).json(product)
  } catch (error) {
    const out = posErrorResponse(error)
    logger.warn(`[POS_SCAN_BLOCKED] ${JSON.stringify({
      status: out.status,
      reason: out.body.code,
      code_length: codeLength,
    })}`)
    return res.status(out.status).json(out.body)
  }
}
