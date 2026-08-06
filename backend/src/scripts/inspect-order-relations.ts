import { Modules } from "@medusajs/framework/utils"

export default async function inspectOrderRelations({ container }) {
  const query = container.resolve("query")
  const orderModuleService = container.resolve(Modules.ORDER) as any

  const lastOrders = await orderModuleService.listOrders({}, { order: { created_at: "DESC" }, take: 1 })
  const lastOrder = lastOrders[0]

  if (!lastOrder) {
    console.log("No orders found.")
    return
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "payment_status",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.amount",
      "payment_collections.payments.id",
      "payment_collections.payments.status",
      "payment_collections.payments.amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.payment_session.data",
    ],
    filters: { id: lastOrder.id },
  })

  console.log("=== Query Graph Result ===")
  console.log(JSON.stringify(orders[0], null, 2))
}
