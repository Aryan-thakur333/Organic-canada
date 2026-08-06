import type { MedusaRequest } from "@medusajs/framework/http"
import { createCartWorkflow, refreshCartItemsWorkflow } from "@medusajs/core-flows"
import { ContainerRegistrationKeys, PromotionActions } from "@medusajs/framework/utils"
import { updateCartPromotionsWorkflow } from "@medusajs/core-flows"
import { PosError } from "./contracts"
import { normalizeMedusaAmount } from "./money"

export type PosNativeCartLine = {
  id: string
  variant_id: string
  quantity: number
  unit_price: number
  subtotal: number
  tax_total: number
  discount_total: number
  total: number
  tax_lines: Array<{ id?: string; code: string; description?: string; rate: number; provider_id?: string }>
  adjustments: Array<{ id?: string; code?: string; amount: number; promotion_id?: string }>
}

export type PosNativeCart = {
  id: string
  currency_code: string
  subtotal: number
  discount_total: number
  tax_total: number
  total: number
  items: PosNativeCartLine[]
  promotions: Array<{ id: string; code: string }>
  payment_collection?: { id: string }
}

const fields = [
  "id", "currency_code", "subtotal", "discount_total", "tax_total", "total",
  "item_subtotal", "item_tax_total", "item_total", "shipping_subtotal", "shipping_total", "shipping_tax_total",
  "items.id", "items.variant_id", "items.quantity", "items.unit_price", "items.subtotal",
  "items.discount_total", "items.tax_total", "items.total", "items.tax_lines.id",
  "items.tax_lines.code", "items.tax_lines.description", "items.tax_lines.rate",
  "items.tax_lines.provider_id", "items.adjustments.id", "items.adjustments.code",
  "items.adjustments.amount", "items.adjustments.promotion_id", "promotions.id", "promotions.code",
  "payment_collection.id",
]

const numeric = (value: unknown, field: string) => {
  const result = normalizeMedusaAmount(value)
  if (!Number.isFinite(result) || result < 0) throw new PosError("POS_TOTAL_MISMATCH", `${field} is not a valid native amount`, 500)
  return result
}

export async function retrievePosNativeCart(req: MedusaRequest, id: string): Promise<PosNativeCart> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph(input: Record<string, unknown>): Promise<{ data: unknown[] }>
  }
  const { data } = await query.graph({ entity: "cart", fields, filters: { id } })
  if (!data[0]) throw new PosError("POS_CART_NOT_FOUND", "Native calculation cart was not found", 404)
  const cart = data[0] as PosNativeCart
  cart.subtotal = numeric(cart.subtotal, "cart subtotal")
  cart.discount_total = numeric(cart.discount_total, "cart discount total")
  cart.tax_total = numeric(cart.tax_total, "cart tax total")
  cart.total = numeric(cart.total, "cart total")
  return cart
}

type NativeCartInput = {
  region_id: string
  currency_code: string
  sales_channel_id: string
  customer_id?: string
  email: string
  address: Record<string, unknown>
  items: Array<{ variant_id: string; quantity: number }>
  promotion_code?: string
  requires_shipping: boolean
  metadata: Record<string, unknown>
}

export async function createPosNativeCart(req: MedusaRequest, input: NativeCartInput): Promise<PosNativeCart> {
  const { result } = await createCartWorkflow(req.scope).run({
    input: {
      region_id: input.region_id,
      currency_code: input.currency_code,
      sales_channel_id: input.sales_channel_id,
      customer_id: input.customer_id,
      email: input.email,
      shipping_address: input.address,
      billing_address: input.address,
      items: input.items.map((item) => ({ ...item, requires_shipping: input.requires_shipping })),
      metadata: input.metadata,
    },
  })
  if (input.promotion_code) {
    await updateCartPromotionsWorkflow(req.scope).run({
      input: { cart_id: result.id, promo_codes: [input.promotion_code], action: PromotionActions.ADD },
    })
  }
  await refreshCartItemsWorkflow(req.scope).run({
    input: { cart_id: result.id, promo_codes: input.promotion_code ? [input.promotion_code] : [], force_refresh: true, force_tax_calculation: true },
  })
  return retrievePosNativeCart(req, result.id)
}
