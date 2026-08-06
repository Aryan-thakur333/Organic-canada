import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../modules/oms"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(OMS_MODULE)
  const query = req.query as Record<string, string | undefined>
  const skip = Math.max(0, Number(query.offset) || 0)
  const take = Math.min(200, Math.max(1, Number(query.limit) || 50))
  const filters: Record<string, any> = {}
  if (query.status) filters.oms_status = query.status.toUpperCase()
  if (query.region_id) filters.region_id = query.region_id
  if (query.currency_code) filters.currency_code = query.currency_code.toLowerCase()
  if (query.customer_id) filters.customer_id = query.customer_id

  const [all] = await service.listAndCountOmsOrders(filters, { take: 2000, order: { created_at: "DESC" } })
  let vendorOrderIds: Set<string> | null = null
  if (query.vendor_id) {
    const vendorOrders = await service.listOmsVendorOrders({ vendor_id: query.vendor_id })
    vendorOrderIds = new Set(vendorOrders.map((item: any) => item.oms_order_id))
  }
  const search = String(query.search || query.q || "").toLowerCase().trim()
  const from = query.date_from ? new Date(query.date_from).getTime() : null
  const to = query.date_to ? new Date(query.date_to).getTime() : null
  const orders = all.filter((order: any) => {
    if (vendorOrderIds && !vendorOrderIds.has(order.id)) return false
    if (search && !String(order.display_id || "").toLowerCase().includes(search) && !String(order.order_id).toLowerCase().includes(search)) return false
    const created = new Date(order.created_at).getTime()
    return !(from && created < from) && !(to && created > to)
  })
  return res.json({ orders: orders.slice(skip, skip + take), count: orders.length, offset: skip, limit: take })
}
