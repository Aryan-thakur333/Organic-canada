import { model } from "@medusajs/framework/utils"

export const Company = model.define("company", {
  id: model.id().primaryKey(),
  company_name: model.text(),
  tax_id: model.text().nullable(),
  gstin: model.text().nullable(),
  contact_name: model.text().nullable(),
  email: model.text().nullable(),
  phone: model.text().nullable(),
  address: model.json().nullable(),
  metadata: model.json().nullable(),
  credit_limit: model.number().default(0),
  status: model.enum(["active", "inactive", "suspended"]).default("active"),
})
