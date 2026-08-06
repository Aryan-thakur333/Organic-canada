import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  {
    serviceName: "b2b",
    field: "b2b_quote",
    linkable: "cart_id",
    primaryKey: "id",
    entity: "b2bQuote",
  } as any,
  {
    serviceName: "cart",
    field: "quote_cart",
    linkable: "cart_id",
    primaryKey: "id",
    entity: "Cart",
  } as any,
  { readOnly: true }
)
