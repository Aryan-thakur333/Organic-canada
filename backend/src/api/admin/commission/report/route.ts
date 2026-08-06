import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COMMISSION_MODULE } from "../../../../modules/commission"

/**
 * GET /admin/commission/report
 * 
 * Returns aggregated financial metrics and paginated commission records 
 * for Admin dashboards. Calculations strictly use saved CommissionRecord 
 * snapshots, preserving historical accuracy.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const commissionService: any = req.scope.resolve(COMMISSION_MODULE)
    
    const limit = parseInt(req.query.limit as string) || 50
    const offset = parseInt(req.query.offset as string) || 0
    const vendor_id = req.query.vendor_id as string | undefined
    const start_date = req.query.start_date as string | undefined
    const end_date = req.query.end_date as string | undefined
    const account_type = req.query.account_type as string | undefined

    const filters: any = {}
    if (vendor_id) filters.vendor_id = vendor_id
    if (account_type) filters.account_type = account_type

    if (start_date || end_date) {
      filters.created_at = {}
      if (start_date) filters.created_at.$gte = new Date(start_date)
      if (end_date) filters.created_at.$lte = new Date(end_date)
    }

    // 1. Fetch Records matching filters
    // Using listAndCount ensures we get pagination data
    const [records, count] = await commissionService.listAndCountCommissionRecords(
      filters, 
      {
        skip: offset,
        take: limit,
        order: { created_at: "DESC" }
      }
    )

    // 2. Fetch all matching records for Aggregate totals
    const allRecords = await commissionService.listCommissionRecords(filters)

    let total_sales = 0 // sum of vendor subtotals
    let total_customer_fees = 0 // account_type != vendor
    let total_vendor_commissions = 0 // account_type == vendor
    let total_vendor_payouts = 0 // account_type == vendor

    let pending_commission = 0
    let settled_commission = 0
    let adjusted_commission = 0

    for (const record of allRecords) {
      if (record.account_type === "vendor") {
        total_sales += Number(record.base_amount || 0)
        total_vendor_commissions += Number(record.commission_amount || 0)
        total_vendor_payouts += Number(record.vendor_payout || 0)
        
        if (record.adjusted_commission_amount != null) {
          adjusted_commission += Number(record.adjusted_commission_amount)
        }
      } else {
        total_customer_fees += Number(record.commission_amount || 0)
      }

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
        total_customer_fees,
        total_vendor_commissions,
        total_vendor_payouts,
        pending_commission,
        settled_commission,
        adjusted_commission
      },
      records,
      count,
      limit,
      offset
    })

  } catch (error: any) {
    console.error("[Admin Commission Report] Error:", error)
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate commission report"
    })
  }
}
