import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  {
    serviceName: "b2b",
    field: "company",
    linkable: "company_id",
    primaryKey: "id",
    entity: "Company",
  } as any,
  {
    serviceName: "customer",
    field: "customer",
    linkable: "customer_id",
    primaryKey: "id",
    entity: "Customer",
  } as any
)
