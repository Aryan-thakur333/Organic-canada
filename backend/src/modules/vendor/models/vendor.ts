import { model } from "@medusajs/framework/utils"

export const Vendor = model.define("vendor", {
  id: model.id().primaryKey(),
  name: model.text(),
  store_name: model.text().default(""),
  email: model.text().unique(),
  phone: model.text().nullable(),
  description: model.text().nullable(),
  company_details: model.json().nullable(),
  status: model.enum(["pending", "approved", "rejected", "suspended"]).default("pending"),
  password_hash: model.text(),
})
