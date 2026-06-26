// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"
import { asArray } from "../_ownership"
import { safeNumber } from "../../../utils/as-array"

async function calculateAvailable(req: MedusaRequest, vendorId: string) {
  const query: any = req.scope.resolve("query")
  const { data: vendorData } = await query.graph({
    entity: "vendor",
    fields: ["product.id", "product.variants.id"],
    filters: { id: vendorId },
  })
  const products = asArray(vendorData?.[0]?.product)
  const productIds = new Set(products.map((p: any) => p.id))
  const variantIds = new Set(products.flatMap((p: any) => asArray(p.variants).map((v: any) => v.id).filter(Boolean)))

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "status", "currency_code", "items.product_id", "items.variant_id", "items.unit_price", "items.quantity"],
    pagination: { take: 1000 },
  })

  let gross = 0
  let orderCount = 0
  let currencyCode = "cad"
  for (const order of asArray(orders)) {
    if (order.status === "canceled") continue
    currencyCode = order.currency_code || currencyCode
    gross += asArray(order.items)
      .filter((item: any) => productIds.has(item.product_id) || variantIds.has(item.variant_id))
      .reduce((sum: number, item: any) => sum + safeNumber(item.unit_price) * safeNumber(item.quantity), 0)
    orderCount++
  }

  const vendorService: any = req.scope.resolve(VENDOR_MODULE)
  let requests = []
  try {
    requests = await vendorService.listPayoutRequests({ vendor_id: vendorId })
  } catch (err) {
    console.error("[Vendor Payouts] Failed to fetch payout requests:", err)
  }

  const pendingPayout = asArray(requests)
    .filter((p: any) => ["pending", "approved"].includes(p.status))
    .reduce((sum: number, p: any) => sum + safeNumber(p.amount), 0)

  const completedPayout = asArray(requests)
    .filter((p: any) => p.status === "paid")
    .reduce((sum: number, p: any) => sum + safeNumber(p.amount), 0)

  const netEarnings = Math.floor(gross * 0.9)
  const commissionAmount = gross - netEarnings
  const availableAmount = Math.max(0, netEarnings - pendingPayout - completedPayout)
  const displayTotal = gross / 100
  const displayCommission = commissionAmount / 100
  const displayNet = netEarnings / 100
  const displayPendingPayout = pendingPayout / 100
  const displayCompletedPayout = completedPayout / 100
  const displayAvailable = availableAmount / 100
  const displayPendingEst = Math.round((gross * 0.9) / 100)

  // Return both original keys (for backward compat) and frontend-expected keys
  return {
    // Original keys (used internally by POST)
    gross,
    commission: commissionAmount,
    net_earnings: netEarnings,
    committed: pendingPayout + completedPayout,
    available: availableAmount,
    currency_code: currencyCode,

    // Frontend-compatible display keys (used by Earnings.jsx)
    // All values are in dollars (not cents) so the frontend can display directly.
    total_revenue: displayTotal,
    commission_deduction: displayCommission,
    net_earnings: displayNet,
    pending_payout: displayPendingPayout,
    completed_payout: displayCompletedPayout,
    pending_earning: displayPendingEst,
    completed_earning: displayPendingEst,
    available_payout: displayAvailable,
    commission_rate: 0.1,
    order_count: orderCount,
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  const vendorService: any = req.scope.resolve(VENDOR_MODULE)
  let payouts = []
  try {
    payouts = await vendorService.listPayoutRequests({ vendor_id: vendor.id }, { order: { created_at: "DESC" } })
  } catch (err) {
    console.error("[Vendor Payouts] Failed to list payout requests:", err)
  }
  const earnings = await calculateAvailable(req, vendor.id)
  return res.json({ payouts, earnings })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  const amount = safeNumber((req.body as any)?.amount)
  if (!Number.isInteger(amount) || amount < 1000) {
    return res.status(400).json({ message: "Minimum payout request is 1000 minor currency units" })
  }
  const earnings = await calculateAvailable(req, vendor.id)
  if (amount > earnings.available) {
    return res.status(400).json({ message: "Payout amount exceeds available earnings" })
  }
  const vendorService: any = req.scope.resolve(VENDOR_MODULE)
  const payout = await vendorService.createPayoutRequests({
    vendor_id: vendor.id,
    amount,
    currency_code: earnings.currency_code,
    status: "pending",
  })
  return res.status(201).json({
    payout,
    earnings: {
      ...earnings,
      available: earnings.available - amount,
      committed: earnings.committed + amount,
    },
  })
}
