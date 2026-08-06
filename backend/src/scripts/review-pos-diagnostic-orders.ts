import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import { OMS_MODULE } from "../modules/oms"
import type PosModuleService from "../modules/pos/service"
import type OmsModuleService from "../modules/oms/service"
import { nativeAmountToMinor } from "../utils/pos/money"

const diagnostics = [
  { transactionId: "01KYMKYA5XY2RP9HKE3YKQS1SF", reportedOrderId: "order_01KYMKYA9FYW5GCB2TPZC5F5YF" },
  { transactionId: "01KYMM18RQJRXA0SHTSRX5EACQ", reportedOrderId: "order_01KYMM18WEMH66TRJZJJ0W371V" },
]

export default async function reviewPosDiagnosticOrders({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pos = container.resolve(POS_MODULE) as PosModuleService
  const oms = container.resolve(OMS_MODULE) as OmsModuleService
  const reviews: unknown[] = []
  for (const { transactionId, reportedOrderId } of diagnostics) {
    const transaction = await pos.retrievePosTransaction(transactionId)
    const orderId = String(transaction.order_id || reportedOrderId)
    const [orderGraph, receipts, omsOrders] = await Promise.all([
      query.graph({
        entity: "order",
        fields: [
          "id", "display_id", "currency_code", "region_id", "email", "customer_id", "status", "fulfillment_status", "payment_status",
          "total", "items.id", "items.variant_id", "items.quantity", "items.detail.fulfilled_quantity",
          "payment_collections.id", "payment_collections.payments.id", "payment_collections.payments.amount",
          "payment_collections.payments.captured_at", "payment_collections.payments.refunds.amount",
          "fulfillments.id", "fulfillments.delivered_at", "fulfillments.canceled_at",
        ],
        filters: { id: orderId },
      }).catch(() => ({ data: [] })),
      pos.listPosReceipts({ transaction_id: transactionId }),
      oms.listOmsOrders({ order_id: orderId }),
    ])
    const order = orderGraph.data[0] as unknown as Record<string, unknown> | undefined
    const orderItems = (order?.items as Array<Record<string, unknown>> | undefined) || []
    const reservations = await query.graph({ entity: "reservation", fields: ["id", "line_item_id", "location_id", "quantity", "metadata"], filters: { line_item_id: orderItems.map((item) => String(item.id)) } }).catch(() => ({ data: [] }))
    const collections = (order?.payment_collections as Array<Record<string, unknown>> | undefined) || []
    const payments = collections.flatMap((collection) => (collection.payments as Array<Record<string, unknown>> | undefined) || [])
    const capturedNative: number = payments.filter((payment) => payment.captured_at).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const refundedNative: number = payments.flatMap((payment) => (payment.refunds as Array<Record<string, unknown>> | undefined) || []).reduce((sum, refund) => sum + Number(refund.amount || 0), 0)
    const currencyCode = String(order?.currency_code || transaction.currency_code)
    const capturedAmount = nativeAmountToMinor(capturedNative, currencyCode, "diagnostic captured amount")
    const refundedAmount = nativeAmountToMinor(refundedNative, currencyCode, "diagnostic refunded amount")
    reviews.push({
      order_id: orderId, display_id: order?.display_id || null, region_id: order?.region_id || transaction.region_id,
      currency_code: order?.currency_code || transaction.currency_code, customer: order?.customer_id || order?.email || transaction.customer_id || null,
      transaction_id: transactionId, transaction_status: transaction.status, payment_status: order?.payment_status || null,
      captured_amount_minor: capturedAmount, refunded_amount_minor: refundedAmount,
      fulfillment_status: order?.fulfillment_status || null, reservations: reservations.data,
      oms_record: omsOrders[0] || null, receipt_record: receipts[0] || null,
      failure_reason: (transaction.metadata as Record<string, unknown> | null)?.failure || "Historical checkout failed after native payment capture and before fulfillment",
      recommended_authorized_action: capturedAmount > refundedAmount && !receipts[0] ? "MANUAL_REVIEW" : "NO_ACTION",
    })
  }
  console.log("[POS_DIAGNOSTIC_ORDER_REVIEW]")
  console.log(JSON.stringify(reviews, null, 2))
}
