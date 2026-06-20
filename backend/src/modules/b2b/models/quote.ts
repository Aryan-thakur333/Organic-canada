import { model } from "@medusajs/framework/utils"

export const Quote = model.define("b2b_quote", {
  id: model.id({ prefix: "b2bq" }).primaryKey(),
  company_id: model.text(),
  customer_id: model.text(),
  customer_email: model.text(),
  status: model
    .enum(["draft", "pending", "approved", "rejected", "converted"])
    .default("draft"),
  /** JSON array of quote line items: [{ product_id, variant_id, title, sku, quantity, unit_price, total }] */
  items: model.json().nullable(),
  /** Subtotal in cents before any negotiation override */
  subtotal: model.number(),
  /** Negotiated total in cents — admin overrides the subtotal on approval */
  negotiated_total: model.number().nullable(),
  admin_notes: model.text().nullable(),
  metadata: model.json().nullable(),
})
