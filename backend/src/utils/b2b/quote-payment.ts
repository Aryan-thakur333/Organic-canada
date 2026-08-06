import { B2B_MODULE } from "../../modules/b2b/index"
import { Modules } from "@medusajs/framework/utils"
import {
  createOrderPaymentCollectionWorkflow,
  markPaymentCollectionAsPaid,
} from "@medusajs/medusa/core-flows"
import { createOrReuseB2BQuotePaymentCollection } from "../../workflows/b2b/create-or-reuse-payment-collection"
import {
  getQuoteOriginalTotalMinor,
  ensureMinorUnitInt,
  minorToDecimalString,
  quoteAdjustmentTotalMinor,
  storedMinor,
} from "./money"
import { validatePayableTotal } from "./quote-amount"
import {
  getQuoteCommissionSnapshot,
  getQuoteNegotiatedSubtotalMinor,
  quoteCommissionResponseFields,
} from "./quote-commission"

export function statusFromPaymentError(error: any) {
  if (Number.isInteger(error?.status)) return error.status
  if (error?.type === "not_found") return 404
  return 400
}

export async function getPaymentQuote(req: any, quoteId: string, customerId: string) {
  const b2bService: any = req.scope.resolve(B2B_MODULE)
  const quote = await b2bService.retrieveQuote(quoteId)

  if (!quote) {
    const error: any = new Error("Quote not found")
    error.status = 404
    throw error
  }

  if (quote.customer_id !== customerId) {
    let customerCompanyId: string | null = null
    try {
      const query: any = req.scope.resolve("query")
      const { data } = await query.graph({
        entity: "customer",
        fields: ["id", "company.id"],
        filters: { id: customerId },
      })
      customerCompanyId = data?.[0]?.company?.id || null
    } catch {
      customerCompanyId = null
    }

    if (customerCompanyId && customerCompanyId === quote.company_id) {
      return { quote, b2bService }
    }

    const error: any = new Error("Quote not found")
    error.status = 404
    throw error
  }

  return { quote, b2bService }
}

export function assertAcceptedPayableQuote(quote: any) {
  if (quote.status !== "accepted") {
    const error: any = new Error("Quote must be accepted before payment can be started.")
    error.status = 400
    throw error
  }

  if (quote.expires_at && new Date(quote.expires_at).getTime() < Date.now()) {
    const error: any = new Error("Quote offer has expired.")
    error.status = 400
    throw error
  }

  if (quote.payment_state === "paid") {
    const error: any = new Error("Quote is already paid.")
    error.status = 409
    throw error
  }
}

export function quotePaymentSummary(quote: any) {
  const payableAmount = validatePayableTotal(quote)
  console.log("[B2B_PAYMENT_AMOUNT_SOURCE]", {
    quote_id: quote.id,
    original_total: quote.original_total,
    negotiated_total: quote.negotiated_total,
    negotiated_subtotal: quote.metadata?.negotiated_subtotal,
    commission_amount: quote.metadata?.commission_amount,
    final_payable_total: quote.metadata?.final_payable_total,
    quote_adjustment_total: quote.quote_adjustment_total,
    payable_amount: payableAmount,
    offer_version: quote.offer_version,
  })

  const amount = ensureMinorUnitInt(payableAmount, "final_payable_total")
  const originalTotal = getQuoteOriginalTotalMinor(quote)
  const negotiatedSubtotal = getQuoteNegotiatedSubtotalMinor(quote)
  const offerVersion = Math.max(1, storedMinor(quote.offer_version, 1))
  const currencyCode = String(quote.currency_code || "cad").toLowerCase()
  const commission = getQuoteCommissionSnapshot(quote)

  return {
    quote_id: quote.id,
    amount,
    amount_decimal: minorToDecimalString(amount),
    currency_code: currencyCode,
    original_total: originalTotal,
    negotiated_total: negotiatedSubtotal,
    ...quoteCommissionResponseFields({
      ...quote,
      currency_code: currencyCode,
      metadata: {
        ...(quote.metadata || {}),
        ...(commission
          ? {
              b2b_commission: commission,
              final_payable_total: amount,
            }
          : {}),
      },
    }),
    quote_adjustment_total: quoteAdjustmentTotalMinor({
      ...quote,
      original_total: originalTotal,
      negotiated_total: negotiatedSubtotal,
    }),
    offer_version: offerVersion,
    payment_state: quote.payment_state || "not_required",
    payment_collection_id: quote.payment_collection_id || quote.metadata?.payment_collection_id || null,
  }
}

export function quoteOrderId(quote: any) {
  return quote.order_id || quote.created_order_id || quote.metadata?.order_id || quote.metadata?.converted_order_id || null
}

export async function getOrderPaymentCollection(query: any, orderId: string, expectedAmount?: number | null) {
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "payment_status",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.amount",
      "payment_collections.currency_code",
      "payment_collections.payments.id",
      "payment_collections.payments.amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.status",
    ],
    filters: { id: orderId },
  })

  const collections = data?.[0]?.payment_collections || []
  if (!Array.isArray(collections) || !collections.length) {
    return null
  }

  const amount = expectedAmount == null ? null : ensureMinorUnitInt(expectedAmount, "expected payment amount")
  return collections.find((collection: any) => {
    return amount == null || Number(collection.amount) === amount
  }) || collections[0]
}

export async function ensureOrderPaymentCollection(
  container: any,
  quote: any,
  orderId = quoteOrderId(quote),
  expectedAmount?: number
) {
  const amountToEnsure = expectedAmount !== undefined ? expectedAmount : validatePayableTotal(quote)
  if (!orderId) {
    return null
  }

  const query: any = container.resolve("query")
  const amount = ensureMinorUnitInt(amountToEnsure, "final_payable_total")
  const existing = await getOrderPaymentCollection(query, orderId, amount)
  if (existing?.id) {
    return existing
  }

  const { result } = await createOrderPaymentCollectionWorkflow(container).run({
    input: {
      order_id: orderId,
      amount,
    },
  })

  return Array.isArray(result) ? result[0] : result
}

export function isCapturedPaymentCollection(collection: any) {
  if (!collection) return false
  const status = String(collection.status || "").toLowerCase()
  if (["paid", "captured", "completed"].includes(status)) return true
  return (collection.payments || []).some((payment: any) => payment.captured_at)
}

export async function markQuoteOrderPaymentCaptured(
  container: any,
  quote: any,
  input: {
    payment_reference?: string | null
    selected_payment_provider_id?: string | null
    captured_by?: string | null
  } = {}
) {
  const orderId = quoteOrderId(quote)
  if (!orderId) {
    return null
  }

  const amount = validatePayableTotal(quote)
  const paymentCollection = await ensureOrderPaymentCollection(container, quote, orderId, amount)
  if (!paymentCollection?.id) {
    return null
  }

  let payment: any = null
  if (!isCapturedPaymentCollection(paymentCollection)) {
    const { result } = await markPaymentCollectionAsPaid(container).run({
      input: {
        order_id: orderId,
        payment_collection_id: paymentCollection.id,
        captured_by: input.captured_by || undefined,
      },
    })
    payment = result
  }

  const orderService: any = container.resolve(Modules.ORDER)
  await updateQuoteOrderPaymentMetadata(orderService, {
    ...quote,
    payment_collection_id: paymentCollection.id,
    metadata: {
      ...(quote.metadata || {}),
      payment_collection_id: paymentCollection.id,
    },
  }, {
    payment_state: "paid",
    selected_payment_provider_id: input.selected_payment_provider_id,
    payment_reference: input.payment_reference,
    paid_at: new Date().toISOString(),
  })

  return {
    payment_collection_id: paymentCollection.id,
    payment,
  }
}

export async function updateQuoteOrderPaymentMetadata(
  orderService: any,
  quote: any,
  input: {
    payment_state: string
    selected_payment_provider_id?: string | null
    payment_reference?: string | null
    paid_at?: string | null
  }
) {
  const orderId = quoteOrderId(quote)
  if (!orderId || !orderService?.retrieveOrder || !orderService?.updateOrders) {
    return null
  }

  try {
    const order = await orderService.retrieveOrder(orderId)
    const [updated] = await orderService.updateOrders([
      {
        id: orderId,
        metadata: {
          ...(order?.metadata || {}),
          source: "b2b_quote",
          quote_id: quote.id,
          payment_state: input.payment_state,
          b2b_quote_payment_state: input.payment_state,
          settlement_mode: input.selected_payment_provider_id === "invoice" ? "offline" : order?.metadata?.settlement_mode || "online",
          selected_payment_provider_id: input.selected_payment_provider_id ?? order?.metadata?.selected_payment_provider_id ?? null,
          payment_reference: input.payment_reference ?? order?.metadata?.payment_reference ?? null,
          paid_at: input.paid_at ?? order?.metadata?.paid_at ?? null,
          b2b_payment_required: true,
          can_fulfill_before_payment: Boolean(order?.metadata?.can_fulfill_before_payment),
        },
      },
    ])

    return updated || order
  } catch {
    return null
  }
}

export async function ensurePaymentCollectionForQuote(b2bService: any, quote: any) {
  return await createOrReuseB2BQuotePaymentCollection(b2bService, quote)
}

export async function markQuotePaymentState(
  b2bService: any,
  quote: any,
  patch: {
    payment_state: string
    selected_payment_provider_id?: string | null
    settlement_mode?: string | null
    payment_reference?: string | null
    paid_at?: Date | null
    metadata?: Record<string, any>
  }
) {
  const settlementMode =
    patch.settlement_mode ??
    patch.metadata?.settlement_mode ??
    (patch.selected_payment_provider_id === "invoice" ? "offline" : quote.settlement_mode ?? quote.metadata?.settlement_mode ?? null)
  const paymentReference =
    patch.payment_reference ??
    patch.metadata?.payment_reference ??
    patch.metadata?.payments?.invoice?.reference ??
    quote.payment_reference ??
    quote.metadata?.payment_reference ??
    null

  return await b2bService.updateQuotes({
    id: quote.id,
    payment_state: patch.payment_state,
    selected_payment_provider_id: patch.selected_payment_provider_id ?? quote.selected_payment_provider_id ?? null,
    settlement_mode: settlementMode,
    payment_reference: paymentReference,
    paid_at: patch.paid_at === undefined ? quote.paid_at || null : patch.paid_at,
    metadata: {
      ...(quote.metadata || {}),
      ...(patch.metadata || {}),
      payment_state: patch.payment_state,
      selected_payment_provider_id: patch.selected_payment_provider_id ?? quote.selected_payment_provider_id ?? null,
      settlement_mode: settlementMode,
      payment_reference: paymentReference,
    },
  })
}
