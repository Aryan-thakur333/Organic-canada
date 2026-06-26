// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../modules/vendor"

const statuses = new Set(["approved", "rejected", "paid"])

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { status, note, external_reference } = req.body as any
  if (!statuses.has(status)) {
    return res.status(400).json({ message: "status must be approved, rejected, or paid" })
  }
  const service: any = req.scope.resolve(VENDOR_MODULE)
  const current = await service.retrievePayoutRequest(req.params.id)
  if (!current || current.status === "paid" || current.status === "rejected") {
    return res.status(409).json({ message: "This payout request is already final" })
  }
  if (status === "paid" && !external_reference) {
    return res.status(400).json({ message: "external_reference is required when marking a payout paid" })
  }
  const payout = await service.updatePayoutRequests({
    id: req.params.id,
    status,
    note: note || null,
    external_reference: external_reference || null,
  })
  return res.json({ payout })
}
