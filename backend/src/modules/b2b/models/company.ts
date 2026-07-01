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
  // ── Credit & Approval fields ────────────────────────────────────────────
  credit_limit: model.number().default(0),
  requested_credit_limit: model.number().default(0),
  approved_credit_limit: model.number().default(0),
  customer_id: model.text().nullable(),
  approved_by: model.text().nullable(),
  approved_at: model.dateTime().nullable(),
  rejected_at: model.dateTime().nullable(),
  rejection_reason: model.text().nullable(),
  admin_note: model.text().nullable(),
  status: model
    .enum(["pending", "approved", "rejected", "active", "inactive", "suspended"])
    .default("pending"),
})
