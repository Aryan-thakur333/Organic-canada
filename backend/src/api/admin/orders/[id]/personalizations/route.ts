import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../../modules/personalization"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
  const records = await service.listOrderItemPersonalizations({ order_id: req.params.id })
  return res.status(200).json({ personalizations: (records || []).map((record: any) => ({
    id: record.id, order_item_id: record.order_item_id, values: record.values,
    price_adjustment: record.price_adjustment, status: record.status,
    production_notes: record.production_notes, template_snapshot: record.template_snapshot,
    upload_references: (record.upload_references || []).map((id: string) => ({ id, preview_url: `/admin/personalization-assets/${id}` })),
  })) })
}
