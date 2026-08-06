import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../../../../../modules/pos"
import { requirePosContext } from "../../../../../../utils/pos/security"
import { PosError, posErrorResponse, type PosService } from "../../../../../../utils/pos/contracts"
import { previewReturn } from "../../../../../../utils/pos/returns"

export async function POST(req: MedusaRequest<{ items?: Array<{ item_id?: string; quantity?: number }> }>, res: MedusaResponse) {
  try {
    const service = req.scope.resolve(POS_MODULE) as PosService
    const transactions = await service.listPosTransactions({ order_id: req.params.id }) as Array<Record<string, unknown>>
    const transaction = transactions[0]
    if (!transaction) throw new PosError("POS_INVALID_RETURN", "POS order not found", 404)
    await requirePosContext(req, String(transaction.register_id))
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: Array<Record<string, unknown>> }> }
    const { data } = await query.graph({ entity: "order", fields: ["id", "items.id", "items.quantity", "items.raw_quantity", "items.unit_price", "items.raw_unit_price", "items.subtotal", "items.raw_subtotal", "items.discount_total", "items.raw_discount_total", "items.tax_total", "items.raw_tax_total", "items.total", "items.raw_total", "items.detail.quantity", "items.detail.raw_quantity"], filters: { id: req.params.id } })
    return res.json({ preview: await previewReturn(service, transaction, data[0], req.body?.items || []) })
  } catch (error) {
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
