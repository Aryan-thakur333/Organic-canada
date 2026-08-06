import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OMS_MODULE } from "../../../../modules/oms"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendorId = (req as any).vendor?.id
  if (!vendorId) return res.status(401).json({ message: "Authentication required" })
  const service: any = req.scope.resolve(OMS_MODULE)
  const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined
  const filters: Record<string, any> = { vendor_id: vendorId }
  if (status) filters.status = status
  const [orders, count] = await service.listAndCountOmsVendorOrders(filters, { take: Math.min(200, Math.max(1, Number(req.query.limit) || 50)), skip: Math.max(0, Number(req.query.offset) || 0), order: { created_at: "DESC" } })
  return res.json({ orders, count })
}
