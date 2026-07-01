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
    .enum([
      "draft",
      "pending_review",
      "approved",
      "rejected",
      "expired",
      "accepted",
      "converted_to_cart",
      "converted_to_order",
    ])
    .default("pending_review"),
  customer_name: model.text().nullable(),
  company_name: model.text().nullable(),
  currency_code: model.text().default("cad"),

  // ── Requested items (snapshot from customer) ──────────────────────────
  // JSON array: [{ product_id, variant_id, title, sku, quantity,
  //                requested_unit_price, current_calculated_unit_price, note }]
  requested_items: model.json().nullable(),

  // ── Requested total in cents (sum of requested items) ────────────────
  requested_total: model.number().default(0),

  // ── Negotiated items (admin override) ────────────────────────────────
  // JSON array: [{ product_id, variant_id, title, sku, quantity,
  //                negotiated_unit_price, line_total }]
  negotiated_items: model.json().nullable(),

  // ── Negotiated total in cents (admin overrides requested_total) ──────
  negotiated_total: model.number().nullable(),

  // ── Notes ────────────────────────────────────────────────────────────
  buyer_note: model.text().nullable(),
  admin_note: model.text().nullable(),
  rejection_reason: model.text().nullable(),

  // ── Timestamps ───────────────────────────────────────────────────────
  expires_at: model.dateTime().nullable(),
  accepted_at: model.dateTime().nullable(),
  rejected_at: model.dateTime().nullable(),

  // ── Cart/order links ─────────────────────────────────────────────────
  created_cart_id: model.text().nullable(),
  created_order_id: model.text().nullable(),

  // ── Legacy fields (keep for backward compatibility) ──────────────────
  items: model.json().nullable(),
  subtotal: model.number().default(0),
  discount_total: model.number().default(0),
  total: model.number().default(0),
  admin_notes: model.text().nullable(),
  customer_note: model.text().nullable(),
  cart_id: model.text().nullable(),
  draft_order_id: model.text().nullable(),
  order_id: model.text().nullable(),

  // ── Metadata ─────────────────────────────────────────────────────────
  metadata: model.json().nullable(),
})