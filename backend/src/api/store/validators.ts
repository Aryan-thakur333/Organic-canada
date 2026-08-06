import { z } from "@medusajs/framework/zod"
import { createFindParams } from "@medusajs/medusa/api/utils/validators"

export const CreateQuote = z.object({
  cart_id: z.string().min(1),
  note: z.string().optional(),
})

// ── CreateB2BQuote ───────────────────────────────────────────────────────────
//
// IMPORTANT: variant_id MUST be optional to support manual quote rows.
//
// Manual quote rows (no variant_id) are valid: they use the submitted
// unit_price directly and NEVER trigger calculatePrices in the backend.
//
// Fields `title`, `sku`, `unit_price`, `price` MUST be present here.
// Medusa's validateAndTransformBody strips unknown fields from the body
// before the route handler runs. Without these, the route sees empty items.
// ────────────────────────────────────────────────────────────────────────────
export const CreateB2BQuote = z.object({
  cart_id: z.string().min(1).optional().nullable(),
  note: z.string().optional(),
  buyer_note: z.string().optional(),
  currency_code: z.string().optional(),
  region_id: z.string().optional(),
  regionId: z.string().optional(),
  country_code: z.string().optional().nullable(),
  countryCode: z.string().optional().nullable(),
  sales_channel_id: z.string().optional().nullable(),
  salesChannelId: z.string().optional().nullable(),
  customer_group_id: z.string().optional().nullable(),
  customerGroupId: z.string().optional().nullable(),
  company_id: z.string().optional().nullable(),
  items: z.array(
    z.object({
      source_type: z.string().optional().nullable(),
      product_id: z.string().optional().nullable(),
      // MUST be optional — manual rows have no variant_id and send null
      variant_id: z.string().optional().nullable(),
      // Title/name of the custom line item (required for manual rows)
      title: z.string().optional().nullable(),
      sku: z.string().optional().nullable(),
      // unit_price comes as a decimal dollar value (e.g. 0.05) from frontend
      unit_price: z.number().optional().nullable(),
      // price is an alias for unit_price accepted from some frontend versions
      price: z.number().optional().nullable(),
      unitPrice: z.number().optional().nullable(),
      displayed_unit_price: z.number().optional().nullable(),
      displayed_unit_price_minor: z.number().optional().nullable(),
      quantity: z.number().positive(),
      note: z.string().optional().nullable(),
    })
  ).min(1).optional(),
}).refine((body) => Boolean(body.cart_id || body.items?.length), {
  message: "Either cart_id or items is required",
})

export const GetQuoteParams = createFindParams({
  limit: 15,
  offset: 0,
})

export const listStoreQuoteQueryConfig = {
  defaults: [
    "id",
    "status",
    "customer_id",
    "company_id",
    "cart_id",
    "draft_order_id",
    "order_change_id",
    "requested_items",
    "requested_total",
    "negotiated_items",
    "negotiated_total",
    "currency_code",
    "buyer_note",
    "customer_note",
    "admin_note",
    "rejection_reason",
    "expires_at",
    "created_at",
    "updated_at",
  ],
  isList: true,
}
