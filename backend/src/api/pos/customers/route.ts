import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { requirePosContext } from "../../../utils/pos/security"
import { PosError, posErrorResponse } from "../../../utils/pos/contracts"

type CreateCustomerBody = { register_id?: string; email?: string; first_name?: string; last_name?: string; phone?: string }

export async function POST(req: MedusaRequest<CreateCustomerBody>, res: MedusaResponse) {
  try {
    await requirePosContext(req, String(req.body?.register_id || ""))
    const email = String(req.body?.email || "").trim().toLowerCase()
    if (!email) throw new PosError("POS_VALIDATION_ERROR", "email is required", 400)
    const customer = await req.scope.resolve(Modules.CUSTOMER).createCustomers({
      email,
      first_name: req.body?.first_name,
      last_name: req.body?.last_name,
      phone: req.body?.phone,
      metadata: { source: "pos" },
    })
    return res.status(201).json({ customer })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
