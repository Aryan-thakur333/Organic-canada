import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PosError, posErrorResponse } from "../../../../../utils/pos/contracts"
import { addAllSellableProductsToPosSalesChannel, type PosAvailabilityChannelKey } from "../../../../../utils/pos/product-availability"

function readChannel(body: Record<string, unknown>) {
  const channel = String(body.channel || "").trim().toLowerCase()
  if (channel !== "canada" && channel !== "usa") throw new PosError("POS_VALIDATION_ERROR", "channel must be canada or usa", 400)
  return channel as PosAvailabilityChannelKey
}

export async function POST(req: MedusaRequest<Record<string, unknown>>, res: MedusaResponse) {
  try {
    const body = req.body || {}
    if (body.confirm !== true) {
      throw new PosError("POS_BULK_CONFIRMATION_REQUIRED", "Explicit admin confirmation is required before bulk POS channel assignment", 400)
    }
    const result = await addAllSellableProductsToPosSalesChannel(req, readChannel(body))
    return res.json(result)
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
