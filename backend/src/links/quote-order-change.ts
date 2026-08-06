import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  {
    serviceName: "b2b",
    field: "b2b_quote",
    linkable: "order_change_id",
    primaryKey: "id",
    entity: "b2bQuote",
  } as any,
  {
    serviceName: "order",
    field: "quote_order_change",
    linkable: "order_change_id",
    primaryKey: "id",
    entity: "OrderChange",
  } as any,
  { readOnly: true }
)
