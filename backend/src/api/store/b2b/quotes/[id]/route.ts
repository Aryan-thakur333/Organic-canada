import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../../modules/b2b"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  const service: any = req.scope.resolve(B2B_MODULE)
  const quote = await service.retrieveQuote(req.params.id)
  if (!quote || quote.customer_id !== customerId) return res.status(404).json({ message: "Quote not found" })
  return res.json({ quote })
}
