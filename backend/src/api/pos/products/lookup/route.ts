import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadRegister, normalizePosLookupCode, resolvePosVariant } from "../../../../utils/pos/catalog"
import { requireOpenSession, requirePosContext, requirePosRegisterAssignment } from "../../../../utils/pos/security"
import { PosError, posErrorResponse } from "../../../../utils/pos/contracts"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void; warn(message: string): void }
  let codeLength = 0
  try {
    const operator = await requirePosContext(req)
    const registerId = String(req.query.register_id || "").trim()
    if (!registerId || registerId.length > 128) throw new PosError("POS_VALIDATION_ERROR", "a valid register_id is required", 400)
    await requirePosRegisterAssignment({ service: operator.service, operatorId: operator.operatorId, registerId })
    await requireOpenSession(operator.service, registerId, operator.operatorId)
    const code = normalizePosLookupCode(req.query.code)
    codeLength = code.length
    const register = await loadRegister(req, registerId)
    const product = await resolvePosVariant(req, register, code, { throwOnOutOfStock: false })
    logger.info(`[POS_BARCODE_LOOKUP_SUCCESS] ${JSON.stringify({ operator_id: operator.operatorId, register_id: registerId, product_id: product.product_id, variant_id: product.variant_id, code_length: codeLength })}`)
    return res.json(product)
  } catch (error) {
    const out = posErrorResponse(error)
    const event = out.status === 404 ? "POS_BARCODE_LOOKUP_NOT_FOUND" : "POS_BARCODE_LOOKUP_BLOCKED"
    logger.warn(`[${event}] ${JSON.stringify({ status: out.status, reason: out.body.code, code_length: codeLength })}`)
    return res.status(out.status).json(out.body)
  }
}
