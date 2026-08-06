import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  {
    serviceName: "b2b",
    field: "b2b_quote",
    linkable: "draft_order_id",
    primaryKey: "id",
    entity: "b2bQuote",
  } as any,
  {
    serviceName: "order",
    field: "quote_draft_order",
    linkable: "order_id",
    primaryKey: "id",
    entity: "Order",
  } as any,
  { readOnly: true }
)
