import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
export async function POST(_req: MedusaRequest, res: MedusaResponse) {
  return res.status(410).json({ code: "POS_INVALID_TRANSITION", message: "Legacy quick checkout is disabled. Use the authenticated /pos/carts/:id/checkout workflow." })
}
