import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BUNDLE_MODULE } from "../../../../../modules/bundle"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(BUNDLE_MODULE)
  const snapshots = await service.listBundleLineSnapshots({ order_id: req.params.id })
  const query: any = req.scope.resolve("query")
  const { data: orders } = await query.graph({ entity: "order", fields: ["id", "items.id", "items.quantity", "items.detail.fulfilled_quantity"], filters: { id: req.params.id } })
  const items = orders[0]?.items || []
  return res.status(200).json({ bundles: snapshots.map((snapshot: any) => {
    const line = items.find((item: any) => item.id === snapshot.order_line_item_id)
    const orderedBundles = Number(line?.quantity || 0)
    const fulfilledBundles = Number(line?.detail?.fulfilled_quantity || 0)
    return { id: snapshot.id, title: snapshot.component_snapshot?.bundle_title, status: snapshot.reservation_status,
      components: (snapshot.component_snapshot?.components || []).map((component: any) => ({ ...component,
        required_quantity: Number(component.quantity) * orderedBundles, picked_quantity: Number(component.quantity) * fulfilledBundles })) }
  }) })
}
