import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  {
    serviceName: "b2b",
    field: "b2b_quote",
    linkable: "customer_id",
    primaryKey: "id",
    entity: "b2bQuote",
  } as any,
  {
    serviceName: "customer",
    field: "quote_customer",
    linkable: "customer_id",
    primaryKey: "id",
    entity: "Customer",
  } as any,
  { readOnly: true }
)
