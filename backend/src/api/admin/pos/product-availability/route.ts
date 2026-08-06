import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PosError, posErrorResponse } from "../../../../utils/pos/contracts"
import { addProductToPosSalesChannel, loadPosAvailabilityRegisters, loadProductForPosAvailability, productAvailabilityPayload, removeProductFromPosSalesChannel, type PosAvailabilityChannelKey } from "../../../../utils/pos/product-availability"

function readProductId(req: MedusaRequest) {
  const productId = String(req.query.product_id || "").trim()
  if (!productId) throw new PosError("POS_VALIDATION_ERROR", "product_id is required", 400)
  return productId
}

function readChannel(body: Record<string, unknown>) {
  const channel = String(body.channel || "").trim().toLowerCase()
  if (channel !== "canada" && channel !== "usa") throw new PosError("POS_VALIDATION_ERROR", "channel must be canada or usa", 400)
  return channel as PosAvailabilityChannelKey
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const product = await loadProductForPosAvailability(req, readProductId(req))
    const channels = await loadPosAvailabilityRegisters(req)
    return res.json(productAvailabilityPayload(product, channels))
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}

export async function POST(req: MedusaRequest<Record<string, unknown>>, res: MedusaResponse) {
  try {
    const body = req.body || {}
    const productId = String(body.product_id || "").trim()
    if (!productId) throw new PosError("POS_VALIDATION_ERROR", "product_id is required", 400)
    const action = String(body.action || "add").trim().toLowerCase()
    if (action === "remove") {
      if (body.confirm !== true) {
        throw new PosError("POS_REMOVE_CONFIRMATION_REQUIRED", "Explicit admin confirmation is required before removing POS availability", 400)
      }
      const result = await removeProductFromPosSalesChannel(req, productId, readChannel(body))
      return res.json(result)
    }
    if (action !== "add") throw new PosError("POS_VALIDATION_ERROR", "action must be add or remove", 400)
    const result = await addProductToPosSalesChannel(req, productId, readChannel(body))
    return res.json(result)
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
