import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createAndCompleteReturnOrderWorkflow } from "@medusajs/core-flows"
import { POS_MODULE } from "../../../../../modules/pos"
import { OMS_MODULE } from "../../../../../modules/oms"
import type OmsModuleService from "../../../../../modules/oms/service"
import { appendPosAudit, requireOpenSession, requirePosContext } from "../../../../../utils/pos/security"
import { PosError, posErrorResponse, type PosService } from "../../../../../utils/pos/contracts"
import { previewReturn } from "../../../../../utils/pos/returns"

type Body = {
  items?: Array<{ item_id?: string; quantity?: number }>
  reason?: string
  refund_method?: string
  restock_location_id?: string
  condition?: string
}

export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  try {
    const service = req.scope.resolve(POS_MODULE) as PosService
    const transactions = await service.listPosTransactions({ order_id: req.params.id }) as Array<Record<string, unknown>>
    const transaction = transactions[0]
    if (!transaction) throw new PosError("POS_INVALID_RETURN", "POS order not found", 404)

    const context = await requirePosContext(req, String(transaction.register_id), ["POS_MANAGER", "ADMIN"])
    const session = await requireOpenSession(service, String(transaction.register_id))
    const payments = await service.listPosPayments({ transaction_id: transaction.id }) as Array<Record<string, unknown>>
    const method = String(req.body?.refund_method || "").toUpperCase()
    if (!payments.some((payment) => payment.method === method)) {
      throw new PosError("POS_INVALID_RETURN", "Refund method must match an original payment method", 422)
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as {
      graph(input: Record<string, unknown>): Promise<{ data: Array<Record<string, unknown>> }>
    }
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "items.id", "items.quantity", "items.raw_quantity", "items.unit_price", "items.raw_unit_price", "items.subtotal", "items.raw_subtotal", "items.discount_total", "items.raw_discount_total", "items.tax_total", "items.raw_tax_total", "items.total", "items.raw_total", "items.detail.quantity", "items.detail.raw_quantity", "fulfillments.shipping_option_id"],
      filters: { id: req.params.id },
    })
    const preview = await previewReturn(service, transaction, data[0], req.body?.items || [])
    const fulfillment = (data[0].fulfillments as Array<Record<string, unknown>> | undefined)?.[0]
    const returnShippingOptionId = String(fulfillment?.shipping_option_id || "")
    const register = await service.retrievePosRegister(String(transaction.register_id)) as Record<string, unknown>
    const restockLocationId = String(req.body?.restock_location_id || register.stock_location_id)
    if (restockLocationId !== register.stock_location_id) {
      throw new PosError("POS_UNAUTHORIZED", "Returns may only restock to the register location", 403)
    }

    const { result: nativeReturn } = await createAndCompleteReturnOrderWorkflow(req.scope).run({
      input: {
        order_id: req.params.id,
        created_by: context.operatorId,
        items: preview.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          note: req.body?.reason || null,
          metadata: { condition: req.body?.condition || "SELLABLE" },
        })),
        receive_now: req.body?.condition !== "DAMAGED",
        refund_amount: preview.refund_amount_minor,
        location_id: restockLocationId,
        return_shipping: returnShippingOptionId ? { option_id: returnShippingOptionId, price: 0 } : undefined,
        note: req.body?.reason || null,
      },
    })

    const posReturn = await service.createPosReturns({
      transaction_id: transaction.id,
      original_order_id: req.params.id,
      return_order_id: nativeReturn.id || null,
      operator_id: context.operatorId,
      refund_method: method,
      refund_amount_minor: preview.refund_amount_minor,
      status: "COMPLETED",
      items: preview.items,
      metadata: { reason: req.body?.reason || null, condition: req.body?.condition || "SELLABLE", native_return_id: nativeReturn.id },
    }) as Record<string, unknown>

    if (method === "CASH") {
      await service.createPosCashMovements({
        register_session_id: session.id,
        operator_id: context.operatorId,
        movement_type: "CASH_REFUND",
        amount_minor: preview.refund_amount_minor,
        reason: `Return ${posReturn.id}`,
        metadata: { order_id: req.params.id },
      })
    }

    const full = preview.refund_amount_minor >= Number(transaction.total_minor || 0)
    const updated = await service.updatePosTransactions({ id: transaction.id, status: full ? "REFUNDED" : "PARTIALLY_REFUNDED" })
    const receiptPayload = {
      receipt_number: `RET-${String(posReturn.id).slice(-10).toUpperCase()}`,
      type: full ? "FULL_RETURN" : "PARTIAL_RETURN",
      original_order_id: req.params.id,
      return_id: posReturn.id,
      items: preview.items,
      refund_amount_minor: preview.refund_amount_minor,
      refund_method: method,
      currency_code: transaction.currency_code,
      date_time: new Date().toISOString(),
    }
    const receipt = await service.createPosReceipts({
      transaction_id: transaction.id,
      receipt_number: receiptPayload.receipt_number,
      order_id: req.params.id,
      customer_id: transaction.customer_id || null,
      receipt_payload: receiptPayload,
      printed_at: null,
      emailed_at: null,
    })

    await appendPosAudit(service, { register_id: transaction.register_id, session_id: session.id, transaction_id: transaction.id, operator_id: context.operatorId, event_type: "POS_RETURN_CREATED", message: "POS return completed", metadata: { return_id: posReturn.id, refund_amount_minor: preview.refund_amount_minor } })
    await appendPosAudit(service, { register_id: transaction.register_id, session_id: session.id, transaction_id: transaction.id, operator_id: context.operatorId, event_type: "POS_REFUND_CREATED", message: "POS refund recorded", metadata: { method, amount_minor: preview.refund_amount_minor } })

    const omsService = req.scope.resolve(OMS_MODULE) as OmsModuleService
    const omsOrders = await omsService.listOmsOrders({ order_id: req.params.id })
    if (omsOrders[0]) {
      await omsService.createOmsOrderEvents({
        oms_order_id: omsOrders[0].id,
        event_type: "RETURN_REQUESTED",
        previous_status: omsOrders[0].oms_status,
        new_status: full ? "RETURNED" : "PARTIALLY_RETURNED",
        actor_type: "pos_manager",
        actor_id: context.operatorId,
        message: "POS return completed",
        metadata: { pos_return_id: posReturn.id, refund_amount_minor: preview.refund_amount_minor },
      })
    }
    return res.status(201).json({ return: posReturn, native_return: nativeReturn, transaction: updated, receipt })
  } catch (error) {
    console.error("[POS_RETURN_FAILED]", error)
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
