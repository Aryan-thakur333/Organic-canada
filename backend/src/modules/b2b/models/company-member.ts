import { model } from "@medusajs/framework/utils"

export const CompanyMember = model.define("companyMember", {
  id: model.id({ prefix: "b2bm" }).primaryKey(),
  company_id: model.text(),
  customer_id: model.text(),
  role: model.enum(["admin", "buyer", "viewer"]).default("buyer"),
  status: model.enum(["active", "inactive"]).default("active"),
  metadata: model.json().nullable(),
})
