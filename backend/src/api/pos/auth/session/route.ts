import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveAuthenticatedPosOperator } from "../../../../utils/pos/security"
import { posErrorResponse } from "../../../../utils/pos/contracts"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const operator = await resolveAuthenticatedPosOperator(req)
    return res.json({ operator: { id: operator.operatorId, email: operator.email, role: operator.role, permissions: operator.permissions } })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}

export async function DELETE(_req: MedusaRequest, res: MedusaResponse) {
  return res.status(204).send()
}
