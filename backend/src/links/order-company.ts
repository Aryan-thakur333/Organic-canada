import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  {
    serviceName: "order",
    field: "order",
    linkable: "order_id",
    primaryKey: "id",
    entity: "Order",
  } as any,
  {
    serviceName: "b2b",
    field: "company",
    linkable: "company_id",
    primaryKey: "id",
    entity: "Company",
  } as any
)
