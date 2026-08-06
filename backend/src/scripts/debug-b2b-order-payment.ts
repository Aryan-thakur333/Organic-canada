import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../modules/b2b/index.js"

interface DebugOrderStatusFields {
  payment_status?: string
  fulfillment_status?: string
}

export default async function debugB2BOrderPayment({ container }: ExecArgs) {
  const query = container.resolve("query")
  const connection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const b2bService: any = container.resolve(B2B_MODULE)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "payment_status",
      "fulfillment_status",
      "currency_code",
      "total",
      "summary",
      "metadata",
      "shipping_address.*",
      "items.id",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.total",
      "items.metadata",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.amount",
      "payment_collections.currency_code",
      "payment_collections.payments.id",
      "payment_collections.payments.status",
      "payment_collections.payments.amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.provider_id",
    ],
    pagination: {
      take: 25,
      order: {
        created_at: "DESC",
      },
    },
  })

  const order = orders?.find((candidate) => candidate.metadata?.source === "b2b_quote")
  if (!order) {
    console.log("[debug-b2b-order-payment] No B2B quote order found.")
    return
  }
  const orderStatusFields = order as typeof order & DebugOrderStatusFields

  let quote: any = null
  const quoteId = order.metadata?.quote_id
  if (quoteId) {
    try {
      quote = await b2bService.retrieveQuote(quoteId)
    } catch {
      quote = null
    }
  }

  const linkRows = await connection.raw(
    `select id, order_id, payment_collection_id, created_at
     from order_payment_collection
     where order_id = ?
     order by created_at desc`,
    [order.id]
  )

  const paymentCollections = order.payment_collections || []
  const capturedAmount = paymentCollections.reduce((sum: number, collection: any) => {
    return sum + (collection.payments || []).reduce((inner: number, payment: any) => {
      return inner + (payment.captured_at ? Number(payment.amount || 0) : 0)
    }, 0)
  }, 0)

  console.log("[debug-b2b-order-payment] Latest B2B order snapshot")
  console.log(JSON.stringify({
    order_id: order.id,
    display_id: order.display_id,
    status: order.status,
    payment_status: orderStatusFields.payment_status ?? null,
    fulfillment_status: orderStatusFields.fulfillment_status ?? null,
    total: order.total,
    summary: order.summary,
    paid_total: order.summary?.paid_total ?? null,
    outstanding_amount: Math.max(0, Number(order.total || 0) - capturedAmount),
    captured_amount: capturedAmount,
    shipping_address: order.shipping_address,
    items: (order.items || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: Number(item.unit_price || 0) * Number(item.quantity || 0),
      metadata: item.metadata,
    })),
    payment_collections: paymentCollections,
    order_payment_collection_links: linkRows?.rows || linkRows,
    metadata: order.metadata,
    quote: quote ? {
      id: quote.id,
      status: quote.status,
      payment_state: quote.payment_state,
      original_total: quote.original_total,
      negotiated_total: quote.negotiated_total,
      payment_collection_id: quote.payment_collection_id,
      paid_at: quote.paid_at,
      settlement_mode: quote.settlement_mode || quote.metadata?.settlement_mode || null,
    } : null,
  }, null, 2))
}
