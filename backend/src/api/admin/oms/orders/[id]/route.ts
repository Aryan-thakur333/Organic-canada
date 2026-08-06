import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../../modules/oms"
import { hydrateOmsOrder } from "../../../../../utils/oms/responses"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(OMS_MODULE)
  try {
    const order = await service.retrieveOmsOrder(req.params.id)
    return res.json({ order: await hydrateOmsOrder(service, order) })
  } catch { return res.status(404).json({ message: "OMS order not found" }) }
}
