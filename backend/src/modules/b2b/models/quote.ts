import { model } from "@medusajs/framework/utils"
import { Company } from "./company"

// DML model names must be camelCase. Medusa converts this to the
// `b2b_quote` table and registers the expected `b2bQuoteService` repository.
export const Quote = model.define("b2bQuote", {
  id: model.id({ prefix: "b2bq" }).primaryKey(),
  company: model.belongsTo(() => Company),
  customer_id: model.text(),
  customer_email: model.text(),
  status: model
    .enum(["draft", "pending", "pending_review", "approved", "rejected", "expired", "converted", "converted_to_order"])
    .default("pending_review"),
  customer_name: model.text().nullable(),
  company_name: model.text().nullable(),
  currency_code: model.text().default("cad"),
  /** JSON array of quote line items: [{ product_id, variant_id, title, sku, quantity, unit_price, total }] */
  items: model.json().nullable(),
  /** Subtotal in cents before any negotiation override */
  subtotal: model.number(),
  /** Negotiated total in cents — admin overrides the subtotal on approval */
  negotiated_total: model.number().nullable(),
  discount_total: model.number().default(0),
  total: model.number(),
  admin_notes: model.text().nullable(),
  customer_note: model.text().nullable(),
  expires_at: model.dateTime().nullable(),
  cart_id: model.text().nullable(),
  draft_order_id: model.text().nullable(),
  order_id: model.text().nullable(),
  metadata: model.json().nullable(),
})
