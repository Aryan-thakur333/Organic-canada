import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  capturePaymentWorkflow,
  completeCartWorkflow,
  createOrderFulfillmentWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/core-flows"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../../../../modules/pos"
import { OMS_MODULE } from "../../../../../modules/oms"
import { ingestOmsOrderWorkflow } from "../../../../../workflows/oms/ingest-order"
import { transitionOmsOrder } from "../../../../../utils/oms/operations"
import { listRegisterVariants, mapPosVariant, assertVariantInRegisterChannel } from "../../../../../utils/pos/catalog"
import { createPosNativeCart, retrievePosNativeCart, type PosNativeCart } from "../../../../../utils/pos/native-cart"
import { appendPosAudit, resolveCurrentPosContext } from "../../../../../utils/pos/security"
import { PosError, integerMinor, posErrorResponse, type PosService } from "../../../../../utils/pos/contracts"
import { validatePayments, type PaymentInput } from "../../../../../utils/pos/payments"
import { nativeAmountToMinor, normalizeMedusaAmount } from "../../../../../utils/pos/money"
import { injectControlledPosFailure } from "../../../../../utils/pos/failure-injection"

type CartItem = {
  variant_id?: string
  quantity?: number
  last_known_price_minor?: number
  last_known_inventory?: number
}

type CheckoutBody = {
  idempotency_key?: string
  confirmed_total_minor?: number
  payments?: PaymentInput[]
  guest_email?: string
  fulfillment_type?: string
  delivery_address?: Record<string, unknown>
}

type CheckoutStage =
  | "CART_VALIDATED"
  | "PAYMENT_AUTHORIZED"
  | "ORDER_CREATED"
  | "INVENTORY_RESERVED"
  | "PAYMENT_CAPTURED"
  | "OMS_INGESTED"
  | "RECEIPT_CREATED"
  | "COMPLETED"

const metadataWithStage = (transaction: Record<string, unknown>, stage: CheckoutStage, extra: Record<string, unknown> = {}) => ({
  ...((transaction.metadata as Record<string, unknown>) || {}),
  checkout_stage: stage,
  stage_updated_at: new Date().toISOString(),
  ...extra,
})

const numeric = (value: unknown) => normalizeMedusaAmount(value)

async function stockLocationAddress(req: MedusaRequest, locationId: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph(input: Record<string, unknown>): Promise<{ data: Array<Record<string, unknown>> }>
  }
  const { data } = await query.graph({ entity: "stock_location", fields: ["id", "address.*"], filters: { id: locationId } })
  const address = data[0]?.address as Record<string, unknown> | undefined
  if (!address?.country_code) throw new PosError("POS_TAX_CONFIGURATION_ERROR", "Register stock location has no taxable address", 422)
  const { id: _id, created_at: _created, updated_at: _updated, deleted_at: _deleted, ...clean } = address
  return { first_name: "POS", last_name: "Customer", address_1: "In-store carryout", ...clean }
}

async function retrieveNativeOrder(req: MedusaRequest, orderId: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph(input: Record<string, unknown>): Promise<{ data: Array<Record<string, unknown>> }>
  }
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id", "display_id", "currency_code", "subtotal", "discount_total", "tax_total", "total", "metadata",
      "item_subtotal", "item_tax_total", "item_total", "shipping_subtotal", "shipping_total", "shipping_tax_total",
      "original_total", "original_subtotal", "original_tax_total", "original_item_total", "original_item_subtotal",
      "original_item_tax_total", "original_shipping_total", "original_shipping_subtotal", "original_shipping_tax_total",
      "summary.*",
      "items.*", "items.tax_lines.id", "items.tax_lines.code", "items.tax_lines.description", "items.tax_lines.rate",
      "items.tax_lines.provider_id", "items.adjustments.id", "items.adjustments.code", "items.adjustments.amount",
      "payment_collections.id", "payment_collections.payments.id", "payment_collections.payments.amount",
      "payment_collections.payments.captured_at", "payment_collections.payments.captures.id",
      "fulfillments.id", "fulfillments.delivered_at", "fulfillments.canceled_at",
    ],
    filters: { id: orderId },
  })
  if (!data[0]) throw new PosError("POS_ORDER_NOT_FOUND", "Completed native order could not be retrieved", 500)
  
  const order = data[0]
  const firstItem = Array.isArray(order.items) ? (order.items as any[])[0] : null
  
  console.error("[POS_ORDER_TOTAL_FIELD_DIAGNOSTIC]", {
    orderId: order.id,
    hasSubtotal: Object.prototype.hasOwnProperty.call(order, "subtotal"),
    rawSubtotalType: typeof order.subtotal,
    rawSubtotal: order.subtotal,
    hasTotal: Object.prototype.hasOwnProperty.call(order, "total"),
    rawTotalType: typeof order.total,
    rawTotal: order.total,
    hasSummary: Boolean(order.summary),
    summaryCurrentOrderTotal: (order.summary as any)?.current_order_total,
    itemCount: Array.isArray(order.items) ? order.items.length : 0,
    firstItem: firstItem ? { quantity: firstItem.quantity, unit_price: firstItem.unit_price, subtotal: firstItem.subtotal, total: firstItem.total } : null
  })

  return order
}

const assertTotalsMatch = (cart: PosNativeCart, order: Record<string, unknown>, paymentAmount: number, valueTypes: any = {}) => {
  const fieldsToCheck: Array<keyof Pick<PosNativeCart, "subtotal" | "discount_total" | "tax_total" | "total">> = ["subtotal", "discount_total", "tax_total", "total"]
  for (const field of fieldsToCheck) {
    const cartValue = normalizeMedusaAmount(cart[field], `cart.${field as string}`)
    const orderValue = normalizeMedusaAmount(order[field], `order.${field as string}`)
    if (orderValue !== cartValue) {
      console.error("[POS_TOTAL_MISMATCH_DIAGNOSTIC]", {
        cart_id: cart.id,
        order_id: order.id,
        currency_code: cart.currency_code,
        cart_unit_price: normalizeMedusaAmount(cart.items?.[0]?.unit_price),
        order_unit_price: normalizeMedusaAmount((order.items as any[])?.[0]?.unit_price),
        cart_item_subtotal: normalizeMedusaAmount((cart as any).item_subtotal),
        order_item_subtotal: normalizeMedusaAmount(order.item_subtotal),
        cart_subtotal: normalizeMedusaAmount(cart.subtotal),
        order_subtotal: normalizeMedusaAmount(order.subtotal),
        cart_discount_total: normalizeMedusaAmount(cart.discount_total),
        order_discount_total: normalizeMedusaAmount(order.discount_total),
        cart_tax_total: normalizeMedusaAmount(cart.tax_total),
        order_tax_total: normalizeMedusaAmount(order.tax_total),
        cart_shipping_subtotal: normalizeMedusaAmount((cart as any).shipping_subtotal),
        order_shipping_subtotal: normalizeMedusaAmount(order.shipping_subtotal),
        cart_total: normalizeMedusaAmount(cart.total),
        order_total: normalizeMedusaAmount(order.total),
        payment_amount: paymentAmount,
        cart_value_types: { subtotal: typeof cart.subtotal, value: cart.subtotal },
        order_value_types: { subtotal: typeof order.subtotal, value: order.subtotal }
      })
      throw new PosError("POS_TOTAL_MISMATCH", `Native cart and order ${field} do not match`, 500, {
        cart_total: normalizeMedusaAmount(cart.total),
        order_total: normalizeMedusaAmount(order.total),
        cart_subtotal: normalizeMedusaAmount(cart.subtotal),
        order_subtotal: normalizeMedusaAmount(order.subtotal),
        cart_unit_price: normalizeMedusaAmount(cart.items?.[0]?.unit_price),
        order_unit_price: normalizeMedusaAmount((order.items as any[])?.[0]?.unit_price)
      })
    }
  }
}

export async function POST(req: MedusaRequest<CheckoutBody>, res: MedusaResponse) {
  const service = req.scope.resolve(POS_MODULE) as PosService
  let transaction: Record<string, unknown> | null = null
  let nativeOrderId: string | null = null
  let authorizedPaymentId: string | null = null
  let paymentCaptured = false
  try {
    const draft = await service.retrievePosOfflineDraft(req.params.id) as Record<string, unknown>
    const context = await resolveCurrentPosContext(req, String(draft.register_id))
    const session = context.session
    if (!session) throw new PosError("POS_REGISTER_SESSION_REQUIRED", "Your register session is no longer active. Select or reopen a register.", 409)
    if (draft.session_id !== session.id) throw new PosError("POS_CART_SESSION_MISMATCH", "Cart belongs to an expired register session.", 409)
    const rawKey = String(req.body?.idempotency_key || draft.idempotency_key || "")
    if (!rawKey) throw new PosError("POS_VALIDATION_ERROR", "idempotency_key is required", 400)

    const key = `POS_CHECKOUT:${context.operatorId}:${draft.register_id}:${draft.cart_id || draft.id}:${rawKey}`
    const existing = await service.listPosTransactions({ idempotency_key: key }) as Array<Record<string, unknown>>
    
    if (existing[0]) {
      const receipts = await service.listPosReceipts({ transaction_id: existing[0].id }) as unknown[]
      if (existing[0].status === "COMPLETED" && existing[0].order_id && receipts[0]) {
        const order = await retrieveNativeOrder(req, String(existing[0].order_id))
        return res.status(201).json({ transaction: existing[0], receipt: receipts[0], order, reused: true, idempotency_key_reused: true })
      }
      if (existing[0].status === "AWAITING_PAYMENT" || existing[0].status === "PAYMENT_AUTHORIZED" || existing[0].status === "ORDER_CREATED") {
        throw new PosError("POS_CHECKOUT_IN_PROGRESS", "A checkout for this request is currently being processed", 409)
      }
      transaction = existing[0]
      nativeOrderId = existing[0].order_id ? String(existing[0].order_id) : null
      const existingMetadata = (existing[0].metadata as Record<string, unknown>) || {}
      authorizedPaymentId = existingMetadata.native_payment_id ? String(existingMetadata.native_payment_id) : null
      paymentCaptured = ["PAYMENT_CAPTURED", "OMS_INGESTED", "RECEIPT_CREATED", "COMPLETED"].includes(String(existingMetadata.checkout_stage))
    }

    if (!transaction && draft.status === "SYNCED") {
      console.error("[POS_IDEMPOTENCY_DECISION]", { cart_id: draft.id, key_present: true, existing_transaction_found: false, draft_sync_status: draft.status, same_key: false, branch: "ALREADY_COMPLETED_DIFFERENT_KEY" })
      throw new PosError("POS_CHECKOUT_ALREADY_COMPLETED", "This cart has already been completed with a different request", 409)
    }

    if (!transaction) {
      console.error("[POS_IDEMPOTENCY_DECISION]", { cart_id: draft.id, key_present: true, existing_transaction_found: false, draft_sync_status: draft.status, same_key: false, branch: "CREATE_NEW" })
    }

    const payload = draft.payload as Record<string, unknown>
    const rawItems = Array.isArray(payload.items) ? payload.items as CartItem[] : []
    if (!rawItems.length) throw new PosError("POS_VALIDATION_ERROR", "Cart is empty", 400)
    const variants = await listRegisterVariants(req, context.register!)
    const lines = rawItems.map((item) => {
      const quantity = integerMinor(item.quantity, "quantity", false)
      const variant = variants.find((entry) => entry.id === item.variant_id)
      if (!variant) throw new PosError("POS_PRODUCT_NOT_FOUND", `Variant ${item.variant_id || ""} is not available in this POS channel`, 404)
      // Sales-channel membership is authoritative at checkout. Scan blocks
      // out-of-channel products with POS_VARIANT_NOT_IN_SALES_CHANNEL; the cart
      // path must enforce the same policy or a product could be sold outside its
      // configured sales channel.
      assertVariantInRegisterChannel(variant, context.register!)
      const mapped = mapPosVariant(variant, context.register!)
      if (!mapped.allow_backorder && mapped.inventory.available_quantity < quantity) {
        throw new PosError("POS_INSUFFICIENT_INVENTORY", `${mapped.product_title} has ${mapped.inventory.available_quantity} available at this register`, 422)
      }
      return { ...mapped, quantity }
    })
    const fulfillmentType = String(req.body?.fulfillment_type || payload.fulfillment_type || "IMMEDIATE_CARRYOUT")
    if (!["IMMEDIATE_CARRYOUT", "IN_STORE_PICKUP", "SHIP_TO_CUSTOMER"].includes(fulfillmentType)) {
      throw new PosError("POS_VALIDATION_ERROR", "Invalid fulfillment type", 400)
    }
    if (fulfillmentType === "SHIP_TO_CUSTOMER" && !req.body?.delivery_address) {
      throw new PosError("POS_VALIDATION_ERROR", "Delivery address is required", 400)
    }
    const address = req.body?.delivery_address || await stockLocationAddress(req, String(context.register?.stock_location_id))
    const email = String(payload.guest_email || req.body?.guest_email || `guest-${draft.id}@pos.eatsie.local`)
    let nativeCart: PosNativeCart
    if (draft.cart_id) {
      nativeCart = await retrievePosNativeCart(req, String(draft.cart_id))
    } else {
      nativeCart = await createPosNativeCart(req, {
        region_id: String(context.register?.region_id),
        currency_code: String(context.register?.currency_code),
        sales_channel_id: String(context.register?.sales_channel_id),
        customer_id: payload.customer_id ? String(payload.customer_id) : undefined,
        email,
        address,
        items: lines.map((line) => ({ variant_id: line.variant_id, quantity: line.quantity })),
        promotion_code: payload.promotion_code ? String(payload.promotion_code) : undefined,
        requires_shipping: fulfillmentType === "SHIP_TO_CUSTOMER",
        metadata: {
          source: "pos", pos_register_id: draft.register_id, pos_session_id: session.id,
          pos_operator_id: context.operatorId, pos_draft_id: draft.id, stock_location_id: context.register?.stock_location_id,
          fulfillment_type: fulfillmentType, idempotency_key: key,
        },
      })
      await service.updatePosOfflineDrafts({ id: draft.id, cart_id: nativeCart.id, metadata: { ...((draft.metadata as Record<string, unknown>) || {}), native_validated_at: new Date().toISOString() } })
    }
    if (nativeCart.currency_code !== String(context.register?.currency_code)) {
      throw new PosError("POS_CURRENCY_MISMATCH", "Native cart currency differs from register currency", 422)
    }
    const currencyCode = String(context.register?.currency_code)
    const totalsMinor = {
      subtotal: nativeAmountToMinor(nativeCart.subtotal, currencyCode, "cart subtotal"),
      discount: nativeAmountToMinor(nativeCart.discount_total, currencyCode, "cart discount"),
      tax: nativeAmountToMinor(nativeCart.tax_total, currencyCode, "cart tax"),
      total: nativeAmountToMinor(nativeCart.total, currencyCode, "cart total"),
    }
    const nativeQuote = { ...nativeCart, subtotal_minor: totalsMinor.subtotal, discount_total_minor: totalsMinor.discount, tax_total_minor: totalsMinor.tax, total_minor: totalsMinor.total }
    for (const line of lines) {
      const nativeLine = nativeCart.items.find((item) => item.variant_id === line.variant_id)
      if (!nativeLine || nativeLine.quantity !== line.quantity) throw new PosError("POS_TOTAL_MISMATCH", "Native cart items differ from the POS draft", 409)
      const draftLine = rawItems.find((item) => item.variant_id === line.variant_id)
      if (draftLine?.last_known_price_minor !== undefined && draftLine.last_known_price_minor !== nativeAmountToMinor(nativeLine.unit_price, currencyCode, "line unit price") && req.body?.confirmed_total_minor === undefined) {
        throw new PosError("POS_TOTAL_CHANGED", "A regional price changed while this draft was offline", 409, { native_cart: nativeQuote })
      }
    }
    if (req.body?.confirmed_total_minor !== totalsMinor.total) {
      throw new PosError("POS_TOTAL_CHANGED", "The cart total changed before checkout. Please review the updated total.", 409, { native_cart: nativeQuote })
    }
    const rawPayments = req.body?.payments || []
    if (rawPayments.length !== 1) throw new PosError("POS_PAYMENT_FAILED", "Production POS checkout currently requires exactly one native payment tender", 422)
    const normalizedPayment = { ...rawPayments[0], amount_minor: totalsMinor.total }
    const payments = validatePayments(totalsMinor.total, [normalizedPayment])
    const receiptNumber = `POS-${String(draft.id).slice(-10).toUpperCase()}`

    if (!transaction) {
      try {
        transaction = await service.createPosTransactions({
          register_id: draft.register_id, session_id: session.id, operator_id: context.operatorId, order_id: null,
          draft_order_id: null, cart_id: nativeCart.id, customer_id: payload.customer_id || null,
          region_id: context.register?.region_id, currency_code: context.register?.currency_code,
          subtotal_minor: totalsMinor.subtotal, discount_total_minor: totalsMinor.discount,
          tax_total_minor: totalsMinor.tax, total_minor: totalsMinor.total, status: "AWAITING_PAYMENT",
          transaction_type: "SALE", idempotency_key: key,
          metadata: { draft_id: draft.id, fulfillment_type: fulfillmentType, checkout_stage: "CART_VALIDATED", receipt_number: receiptNumber },
        }) as Record<string, unknown>
      } catch (e: any) {
        const isUniqueConstraintViolation = (err: any): boolean => {
          if (!err) return false;
          const codes = [err.code, err.cause?.code, err.driverException?.code, err.originalError?.code];
          if (codes.includes("23505") || codes.includes(23505)) return true;
          const names = [err.name, err.cause?.name];
          if (names.includes("UniqueConstraintViolationException")) return true;
          
          const msg = String(err.message || "").toLowerCase();
          const dtl = String(err.detail || err.cause?.detail || "").toLowerCase();
          
          if (msg.includes("idx_pos_transaction_idempotency") || dtl.includes("idx_pos_transaction_idempotency")) return true;
          if (msg.includes("unique constraint") || dtl.includes("unique constraint")) return true;
          
          // Medusa application-level duplicate error shape
          if (msg.includes("pos transaction") && msg.includes("idempotency_key") && msg.includes("already exists")) {
            return true;
          }
          
          return false;
        };

        if (isUniqueConstraintViolation(e)) {
          const concurrent = await service.listPosTransactions({ idempotency_key: key }) as Array<Record<string, unknown>>
          if (concurrent[0] && concurrent[0].status === "COMPLETED" && concurrent[0].order_id) {
            const receipts = await service.listPosReceipts({ transaction_id: concurrent[0].id }) as unknown[]
            if (receipts[0]) {
              const order = await retrieveNativeOrder(req, String(concurrent[0].order_id))
              return res.status(200).json({ transaction: concurrent[0], receipt: receipts[0], order, reused: true, idempotency_key_reused: true })
            }
          }
          throw new PosError("POS_CHECKOUT_IN_PROGRESS", "A checkout for this request is currently being processed", 409)
        }
        throw e
      }
    } else if (transaction.cart_id !== nativeCart.id || numeric(transaction.total_minor) !== totalsMinor.total) {
      throw new PosError("POS_CHECKOUT_RECOVERY_REQUIRED", "The retained transaction no longer matches its native cart", 409)
    }
    const payment = payments[0]
    const providerId = payment.method === "CASH" ? "pp_pos_cash" : "pp_system_default"
    const paymentData = payment.method === "CASH"
      ? {
          register_id: draft.register_id, session_id: session.id, operator_id: context.operatorId,
          transaction_id: transaction.id, receipt_number: receiptNumber,
          amount_tendered_minor: payment.amount_tendered_minor, tendered_amount: payment.amount_tendered_minor,
          change_due_minor: payment.change_due_minor, idempotency_key: key,
        }
      : {
          terminal_reference: payment.terminal_reference, authorization_reference: payment.authorization_reference,
          last_four: payment.last_four, transaction_id: transaction.id, idempotency_key: key,
        }
    const paymentService = req.scope.resolve(Modules.PAYMENT)
    if (!authorizedPaymentId) {
      const retainedCollectionId = ((transaction.metadata as Record<string, unknown>) || {}).payment_collection_id
      const collectionId = retainedCollectionId
        ? String(retainedCollectionId)
        : (await createPaymentCollectionForCartWorkflow(req.scope).run({ input: { cart_id: nativeCart.id } })).result.id
      const { result: paymentSession } = await createPaymentSessionsWorkflow(req.scope).run({
        input: { payment_collection_id: collectionId, provider_id: providerId, customer_id: payload.customer_id ? String(payload.customer_id) : undefined, data: paymentData },
      })
      const authorized = await paymentService.authorizePaymentSession(paymentSession.id, {})
      authorizedPaymentId = authorized.id
      transaction = await service.updatePosTransactions({ id: transaction.id, status: "PAYMENT_AUTHORIZED", metadata: metadataWithStage(transaction, "PAYMENT_AUTHORIZED", { payment_collection_id: collectionId, payment_session_id: paymentSession.id, native_payment_id: authorized.id, provider_id: providerId }) }) as Record<string, unknown>
      injectControlledPosFailure({ stage: "AFTER_PAYMENT_AUTHORIZATION", idempotencyKey: key, requestedStage: req.headers["x-pos-failure-stage"], suppliedToken: req.headers["x-pos-failure-token"] })
    }
    if (!nativeOrderId) {
      const completed = await completeCartWorkflow(req.scope).run({ input: { id: nativeCart.id } })
      nativeOrderId = completed.result.id
      transaction = await service.updatePosTransactions({ id: transaction.id, order_id: nativeOrderId, status: "ORDER_CREATED", metadata: metadataWithStage(transaction, "ORDER_CREATED") }) as Record<string, unknown>
      injectControlledPosFailure({ stage: "AFTER_ORDER_CREATION", idempotencyKey: key, requestedStage: req.headers["x-pos-failure-stage"], suppliedToken: req.headers["x-pos-failure-token"] })
      transaction = await service.updatePosTransactions({ id: transaction.id, metadata: metadataWithStage(transaction, "INVENTORY_RESERVED") }) as Record<string, unknown>
      injectControlledPosFailure({ stage: "AFTER_INVENTORY_RESERVATION", idempotencyKey: key, requestedStage: req.headers["x-pos-failure-stage"], suppliedToken: req.headers["x-pos-failure-token"] })
    }
    if (!paymentCaptured) {
      const captured = await capturePaymentWorkflow(req.scope).run({ input: { payment_id: authorizedPaymentId, amount: nativeCart.total, captured_by: context.operatorId } })
      paymentCaptured = true
      transaction = await service.updatePosTransactions({ id: transaction.id, status: "PAYMENT_CAPTURED", metadata: metadataWithStage(transaction, "PAYMENT_CAPTURED", { native_capture_ids: captured.result.captures?.map((capture) => capture.id) || [] }) }) as Record<string, unknown>
      injectControlledPosFailure({ stage: "AFTER_PAYMENT_CAPTURE", idempotencyKey: key, requestedStage: req.headers["x-pos-failure-stage"], suppliedToken: req.headers["x-pos-failure-token"] })
    }

    const order = await retrieveNativeOrder(req, nativeOrderId)
    assertTotalsMatch(nativeCart, order, totalsMinor.total, {})
    const existingPosPayments = await service.listPosPayments({ transaction_id: transaction.id }) as unknown[]
    if (!existingPosPayments.length) await service.createPosPayments({
      transaction_id: transaction.id, provider: providerId, method: payment.method, amount_minor: totalsMinor.total,
      currency_code: context.register?.currency_code, reference: payment.method === "CARD_MANUAL" ? payment.authorization_reference : authorizedPaymentId,
      status: "CAPTURED", metadata: { terminal_reference: payment.terminal_reference || null, last_four: payment.last_four || null, amount_tendered_minor: payment.amount_tendered_minor || totalsMinor.total, change_due_minor: payment.change_due_minor, native_payment_id: authorizedPaymentId },
    })

    const orderItems = (order.items as Array<Record<string, unknown>>) || []
    const existingFulfillments = (order.fulfillments as Array<Record<string, unknown>> | undefined) || []
    if (fulfillmentType !== "SHIP_TO_CUSTOMER" && !existingFulfillments.some((fulfillment) => !fulfillment.canceled_at)) {
      const { result: fulfillment } = await createOrderFulfillmentWorkflow(req.scope).run({
        input: { order_id: nativeOrderId, items: orderItems.map((item) => ({ id: String(item.id), quantity: numeric(item.quantity) })), location_id: String(context.register?.stock_location_id), requires_shipping: false, no_notification: true, created_by: context.operatorId, metadata: { source: "pos", fulfillment_type: fulfillmentType } },
      })
      await markOrderFulfillmentAsDeliveredWorkflow(req.scope).run({ input: { orderId: nativeOrderId, fulfillmentId: fulfillment.id } })
    }

    const ingest = await ingestOmsOrderWorkflow(req.scope).run({ input: { order_id: nativeOrderId } })
    const omsService = req.scope.resolve(String(OMS_MODULE)) as PosService
    let oms = ingest.result.oms_order as Record<string, unknown>
    const receivedEvents = await omsService.listOmsOrderEvents({ oms_order_id: oms.id, event_type: "POS_ORDER_RECEIVED" }) as unknown[]
    if (!receivedEvents.length) await omsService.createOmsOrderEvents({ oms_order_id: oms.id, event_type: "POS_ORDER_RECEIVED", previous_status: oms.oms_status, new_status: oms.oms_status, actor_type: "pos_operator", actor_id: context.operatorId, message: "POS order received", metadata: { pos_register_id: draft.register_id, pos_session_id: session.id, pos_operator_id: context.operatorId, transaction_id: transaction.id, sales_channel_id: context.register?.sales_channel_id, stock_location_id: context.register?.stock_location_id, fulfillment_type: fulfillmentType, payment_method: payment.method } })
    if (fulfillmentType !== "SHIP_TO_CUSTOMER") {
      const sequence = ["CONFIRMED", "ALLOCATED", "PROCESSING", "READY_FOR_FULFILLMENT", "SHIPPED", "DELIVERED"] as const
      const currentIndex = sequence.indexOf(oms.oms_status as typeof sequence[number])
      for (const next of sequence.slice(currentIndex + 1)) {
        oms = await transitionOmsOrder(req.scope, oms, next, "pos_operator", context.operatorId, `POS carryout mapped to ${next}`) as Record<string, unknown>
      }
    }
    transaction = await service.updatePosTransactions({ id: transaction.id, metadata: metadataWithStage(transaction, "OMS_INGESTED", { oms_order_id: oms.id }) }) as Record<string, unknown>
    injectControlledPosFailure({ stage: "AFTER_OMS_INGESTION", idempotencyKey: key, requestedStage: req.headers["x-pos-failure-stage"], suppliedToken: req.headers["x-pos-failure-token"] })

    const receiptPayload = {
      store_name: "Eatsie", register_name: context.register?.name, receipt_number: receiptNumber,
      order_id: nativeOrderId, order_display_id: order.display_id, date_time: new Date().toISOString(),
      operator_id: context.operatorId, customer_id: payload.customer_id || null,
      items: orderItems.map((item) => ({ title: item.product_title || item.title, variant_title: item.variant_title, sku: item.variant_sku, quantity: numeric(item.quantity), unit_price_minor: nativeAmountToMinor(item.unit_price, currencyCode, "order line unit price"), subtotal_minor: nativeAmountToMinor(item.subtotal, currencyCode, "order line subtotal"), discount_total_minor: nativeAmountToMinor(item.discount_total, currencyCode, "order line discount"), tax_total_minor: nativeAmountToMinor(item.tax_total, currencyCode, "order line tax"), line_total_minor: nativeAmountToMinor(item.total, currencyCode, "order line total"), tax_lines: item.tax_lines, adjustments: item.adjustments })),
      subtotal_minor: totalsMinor.subtotal, discount_total_minor: totalsMinor.discount,
      tax_total_minor: totalsMinor.tax, total_minor: totalsMinor.total,
      payments: [{ method: payment.method, amount_minor: totalsMinor.total, amount_tendered_minor: payment.amount_tendered_minor || totalsMinor.total, change_due_minor: payment.change_due_minor, reference: payment.method === "CARD_MANUAL" ? payment.authorization_reference : authorizedPaymentId }],
      currency_code: context.register?.currency_code,
      return_policy: "Returns require the original receipt and eligibility approval.",
      safe_order_reference: `${nativeOrderId}:${transaction.id}`,
    }
    const existingReceipts = await service.listPosReceipts({ transaction_id: transaction.id }) as Array<Record<string, unknown>>
    const receipt = existingReceipts[0] || await service.createPosReceipts({ transaction_id: transaction.id, receipt_number: receiptNumber, order_id: nativeOrderId, customer_id: payload.customer_id || null, receipt_payload: receiptPayload, printed_at: null, emailed_at: null })
    transaction = await service.updatePosTransactions({ id: transaction.id, metadata: metadataWithStage(transaction, "RECEIPT_CREATED") }) as Record<string, unknown>
    injectControlledPosFailure({ stage: "AFTER_RECEIPT_CREATION", idempotencyKey: key, requestedStage: req.headers["x-pos-failure-stage"], suppliedToken: req.headers["x-pos-failure-token"] })
    if (payment.method === "CASH") {
      const completedTransactionId = String(transaction.id)
      const movements = await service.listPosCashMovements({ register_session_id: session.id, movement_type: "CASH_SALE" }) as Array<Record<string, unknown>>
      const recorded = movements.some((movement) => (movement.metadata as Record<string, unknown> | null)?.transaction_id === completedTransactionId)
      if (!recorded) await service.createPosCashMovements({ register_session_id: session.id, operator_id: context.operatorId, movement_type: "CASH_SALE", amount_minor: totalsMinor.total, reason: `POS sale ${nativeOrderId}`, metadata: { transaction_id: completedTransactionId, amount_tendered_minor: payment.amount_tendered_minor, change_due_minor: payment.change_due_minor } })
    }
    transaction = await service.updatePosTransactions({ id: transaction.id, status: "COMPLETED", metadata: metadataWithStage(transaction, "COMPLETED") }) as Record<string, unknown>
    await service.updatePosOfflineDrafts({ id: draft.id, status: "SYNCED", cart_id: nativeCart.id, metadata: { ...((draft.metadata as Record<string, unknown>) || {}), sync_status: "SYNCED", transaction_id: transaction.id, order_id: nativeOrderId, synced_at: new Date().toISOString() } })
    await appendPosAudit(service, { register_id: draft.register_id, session_id: session.id, transaction_id: transaction.id, operator_id: context.operatorId, event_type: "POS_PAYMENT_CAPTURED", message: "Native POS payment captured", metadata: { method: payment.method, provider_id: providerId, total_minor: totalsMinor.total, native_total: nativeCart.total } })
    await appendPosAudit(service, { register_id: draft.register_id, session_id: session.id, transaction_id: transaction.id, operator_id: context.operatorId, event_type: "POS_ORDER_CREATED", message: "Native Medusa POS cart completed", metadata: { order_id: nativeOrderId, cart_id: nativeCart.id } })
    return res.status(201).json({ transaction, order, receipt, oms_order: oms, native_cart: nativeQuote, reused: false })
  } catch (error) {
    console.error("[POS_CHECKOUT_FAILED]", error)
    let compensationFailed = false
    if (transaction?.id && authorizedPaymentId && !nativeOrderId && !paymentCaptured) {
      await appendPosAudit(service, { register_id: transaction.register_id, session_id: transaction.session_id, transaction_id: transaction.id, operator_id: transaction.operator_id, event_type: "POS_COMPENSATION_STARTED", message: "Checkout compensation started", metadata: { native_payment_id: authorizedPaymentId } }).catch(() => undefined)
      try {
        const paymentService = req.scope.resolve(Modules.PAYMENT)
        await paymentService.cancelPayment(authorizedPaymentId)
        transaction = await service.updatePosTransactions({ id: transaction.id, status: "FAILED", metadata: { ...((transaction.metadata as Record<string, unknown>) || {}), checkout_stage: "CART_VALIDATED", native_payment_id: null, authorization_canceled: true } }) as Record<string, unknown>
        await appendPosAudit(service, { register_id: transaction.register_id, session_id: transaction.session_id, transaction_id: transaction.id, operator_id: transaction.operator_id, event_type: "POS_PAYMENT_CANCELLED", message: "Native payment authorization canceled", metadata: { native_payment_id: authorizedPaymentId } })
        await appendPosAudit(service, { register_id: transaction.register_id, session_id: transaction.session_id, transaction_id: transaction.id, operator_id: transaction.operator_id, event_type: "POS_COMPENSATION_COMPLETED", message: "Checkout compensation completed", metadata: {} })
      } catch (compensationError) {
        compensationFailed = true
        console.error("[POS_CHECKOUT_COMPENSATION_FAILED]", compensationError)
        await appendPosAudit(service, { register_id: transaction.register_id, session_id: transaction.session_id, transaction_id: transaction.id, operator_id: transaction.operator_id, event_type: "POS_COMPENSATION_FAILED", message: "Checkout compensation failed", metadata: { failure: compensationError instanceof Error ? compensationError.message : "Unknown compensation failure" } }).catch(() => undefined)
      }
    }
    if (transaction?.id) {
      try {
        await service.updatePosTransactions({ id: transaction.id, status: nativeOrderId ? "ON_HOLD" : "FAILED", order_id: nativeOrderId, metadata: { ...((transaction.metadata as Record<string, unknown>) || {}), failure: error instanceof Error ? error.message : "Unexpected failure", compensation_failed: compensationFailed, recovery_required: Boolean(nativeOrderId) } })
      } catch { /* preserve original error */ }
    }
    const out = posErrorResponse(error)
    return res.status(out.status).json(out.body)
  }
}
