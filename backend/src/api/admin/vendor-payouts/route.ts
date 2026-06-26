// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(VENDOR_MODULE)
  const payouts = await service.listPayoutRequests({}, { order: { created_at: "DESC" }, take: 200 })
  return res.json({ payouts, count: payouts.length })
}
