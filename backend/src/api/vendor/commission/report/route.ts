import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COMMISSION_MODULE } from "../../../../modules/commission"

/**
 * GET /vendor/commission/report
 * 
 * Returns the authenticated vendor's commission records and aggregates.
 * Security: Strictly filters all queries by `req.vendor.id`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const vendor = (req as any).vendor
    if (!vendor || !vendor.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" })
    }

    const commissionService: any = req.scope.resolve(COMMISSION_MODULE)
    
    const limit = parseInt(req.query.limit as string) || 50
    const offset = parseInt(req.query.offset as string) || 0
    const start_date = req.query.start_date as string | undefined
    const end_date = req.query.end_date as string | undefined

    const filters: any = {
      vendor_id: vendor.id,
      account_type: "vendor"
    }

    if (start_date || end_date) {
      filters.created_at = {}
      if (start_date) filters.created_at.$gte = new Date(start_date)
      if (end_date) filters.created_at.$lte = new Date(end_date)
    }

    // 1. Fetch Paginated Records for this vendor
    const [records, count] = await commissionService.listAndCountCommissionRecords(
      filters, 
      {
        skip: offset,
        take: limit,
        order: { created_at: "DESC" }
      }
    )

    // 2. Aggregate Totals for this vendor
    const allRecords = await commissionService.listCommissionRecords(filters)

    let total_sales = 0
    let total_vendor_commissions = 0
    let total_vendor_payouts = 0
    let pending_commission = 0
    let settled_commission = 0

    for (const record of allRecords) {
      total_sales += Number(record.base_amount || 0)
      total_vendor_commissions += Number(record.commission_amount || 0)
      total_vendor_payouts += Number(record.vendor_payout || 0)

      if (record.status === "pending") {
        pending_commission += Number(record.commission_amount || 0)
      } else if (record.status === "paid_out" || record.status === "collected") {
        settled_commission += Number(record.commission_amount || 0)
      }
    }

    return res.json({
      success: true,
      totals: {
        total_sales,
        total_vendor_commissions,
        total_vendor_payouts,
        pending_commission,
        settled_commission
      },
      records,
      count,
      limit,
      offset
    })

  } catch (error: any) {
    console.error("[Vendor Commission Report] Error:", error)
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate commission report"
    })
  }
}
