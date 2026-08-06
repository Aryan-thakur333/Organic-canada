import { model } from "@medusajs/framework/utils"
import { APPROVAL_STATUSES } from "../constants"

// Monetary values are canonical major-unit decimal strings, never floating-point numbers.
export const PricingRemediationRecord = model.define("pricingRemediationRecord", {
  id: model.id({ prefix: "prr" }).primaryKey(),
  product_id: model.text(), product_handle: model.text(), product_title: model.text(),
  variant_id: model.text().unique(), variant_title: model.text(), classification: model.text(),
  current_cad_price: model.text().nullable(), approved_cad_price: model.text().nullable(),
  current_usd_price: model.text().nullable(), approved_usd_price: model.text().nullable(),
  cad_status: model.text(), usd_status: model.text(), cad_suspicion: model.text(), usd_suspicion: model.text(),
  approval_status: model.enum([...APPROVAL_STATUSES]).default("pending"),
  merchant_note: model.text().nullable(), snapshot_updated_at: model.dateTime().nullable(), updated_by: model.text().nullable(),
})
