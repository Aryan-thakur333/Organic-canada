import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { COMMISSION_MODULE } from "../modules/commission/index"
import { calculateMultiVendorPayouts } from "../utils/commission/vendor-payout"

export type RecordCommissionInput = {
  order: any;
  splitResult: any;
}

const recordCommissionStep = createStep(
  "record-commission-step",
  async (input: RecordCommissionInput, { container }) => {
    const { order, splitResult } = input
    const commissionService: any = container.resolve(COMMISSION_MODULE)
    const orderId = order.id
    const currency_code = order.currency_code || "cad"

    // 1. Identify Customer Platform Fee
    // Find the Platform Fee line item in the order to get exact snapshot details
    const platformFeeItem = (order.items || []).find((i: any) => 
      i.title === "Platform Fee" || i.metadata?.is_platform_fee
    )

    if (platformFeeItem) {
      const meta = platformFeeItem.metadata || {}
      const customerType = meta.customer_type || "normal_customer"
      
      // Idempotency check for customer record
      const existingRecords = await commissionService.listCommissionRecords({
        order_id: orderId,
        account_type: customerType
      }, { take: 1 })

      if (!existingRecords || existingRecords.length === 0) {
        await commissionService.createCommissionRecords({
          order_id: orderId,
          customer_id: order.customer_id || null,
          vendor_id: null,
          account_type: customerType,
          base_amount: meta.base_amount || (order.item_subtotal - order.discount_total + order.shipping_subtotal + order.tax_total),
          fee_type: meta.fee_type || "none",
          fee_value: meta.fee_value || 0,
          commission_amount: meta.fee_amount || (platformFeeItem.unit_price * platformFeeItem.quantity),
          vendor_payout: null,
          currency_code,
          status: "collected" // Customer pays immediately
        })
        console.log(`[Commission Workflow] Customer platform fee recorded for order ${orderId}`)
      }
    }

    // 2. Process Vendor Commissions
    let activeVendorRule: any = null
    try {
      const settings = await commissionService.listCommissionSettings({
        account_type: "vendor",
        is_active: true
      }, { take: 1 })
      activeVendorRule = settings?.[0] || null
    } catch (err: any) {
      console.warn(`[Commission Workflow] Failed to load active vendor setting:`, err.message)
    }

    if (splitResult?.vendor_count > 0 && splitResult?.buckets) {
      const vendorPayouts = calculateMultiVendorPayouts(splitResult.buckets, activeVendorRule)
      
      for (const payout of vendorPayouts) {
        // Idempotency check for vendor
        const existingRecords = await commissionService.listCommissionRecords({
          order_id: orderId,
          vendor_id: payout.vendor_id
        }, { take: 1 })
        
        if (existingRecords && existingRecords.length > 0) {
          continue
        }

        await commissionService.createCommissionRecords({
          order_id: orderId,
          customer_id: null,
          vendor_id: payout.vendor_id,
          account_type: "vendor",
          base_amount: payout.subtotal,
          fee_type: activeVendorRule?.fee_type || "percentage",
          fee_value: activeVendorRule?.fee_value || 0,
          commission_amount: payout.commission_amount,
          vendor_payout: payout.vendor_payout,
          currency_code,
          status: "pending" // Vendor payout is pending fulfillment
        })
        console.log(`[Commission Workflow] Vendor commission recorded for vendor ${payout.vendor_id}, order ${orderId}`)
      }
    }

    // Pass data forward if needed for compensation
    return new StepResponse({ success: true, orderId }, { orderId })
  },
  async (compensateData, { container }) => {
    // Revert step: delete all commission records linked to this order
    if (compensateData?.orderId) {
      const commissionService: any = container.resolve(COMMISSION_MODULE)
      try {
        const records = await commissionService.listCommissionRecords({ order_id: compensateData.orderId })
        if (records.length > 0) {
          await commissionService.deleteCommissionRecords(records.map((r: any) => r.id))
          console.log(`[Commission Workflow Revert] Deleted records for order ${compensateData.orderId}`)
        }
      } catch (e: any) {
        console.error("[Commission Workflow Revert] Failed to revert records:", e.message)
      }
    }
  }
)

/**
 * Record Commission Workflow
 * 
 * Safely creates immutable commission snapshots for both the Customer Platform Fee
 * and Vendor Payouts, preventing duplication.
 */
export const recordCommissionWorkflow = createWorkflow(
  "record-commission",
  (input: RecordCommissionInput) => {
    const result = recordCommissionStep(input)
    return new WorkflowResponse(result)
  }
)
