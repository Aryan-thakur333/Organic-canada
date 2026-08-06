import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { requirePosContext } from "../../../../utils/pos/security"
import { posErrorResponse } from "../../../../utils/pos/contracts"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    await requirePosContext(req, String(req.query.register_id || ""))
    const customer = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(req.params.id)
    return res.json({ customer: { id: customer.id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name, phone: customer.phone } })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
