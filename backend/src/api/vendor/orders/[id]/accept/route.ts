import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateVendorOrderState } from "../_shared"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return updateVendorOrderState(req, res, "accepted")
}
