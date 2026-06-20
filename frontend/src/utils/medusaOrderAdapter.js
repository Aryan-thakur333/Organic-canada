import { minorToMajor } from "../lib/medusa/money";

/**
 * Map a Medusa store order into the legacy checkout "SavedOrder" shape used by Profile / success UI.
 * @param {Record<string, unknown>} order
 * @param {{
 *   paymentMethod: string;
 *   fulfillment: string;
 *   paymentIntentId?: string | null;
 *   customer: { name: string; phone: string; address: string };
 * }} ctx
 */
export function medusaOrderToSavedOrder(order, ctx) {
  const items = Array.isArray(order.items) ? order.items : [];
  const currency = String(order.currency_code || "usd").toLowerCase();

  const lineItems = items.map((li) => {
    const qty = Number(li.quantity) || 1;
    const unit = minorToMajor(li.unit_price ?? 0);
    return {
      id: String(li.variant_id || li.id),
      title: String(li.title || li.product_title || "Item"),
      price: unit,
      quantity: qty,
      image: li.thumbnail || null,
    };
  });

  const totalMajor = minorToMajor(order.total ?? 0);

  return {
    id: String(order.id),
    fulfillment: ctx.fulfillment,
    paymentMethod: ctx.paymentMethod,
    status: String(order.status || "pending"),
    paymentIntentId: ctx.paymentIntentId ?? null,
    subtotal: minorToMajor(order.subtotal ?? order.item_subtotal ?? 0),
    tax: minorToMajor(order.tax_total ?? 0),
    discount: minorToMajor(order.discount_total ?? 0),
    total: totalMajor,
    totalCents: Math.round(totalMajor * 100),
    customer: ctx.customer,
    items: lineItems,
    createdAt: order.created_at
      ? new Date(order.created_at).toISOString()
      : new Date().toISOString(),
    currency_code: currency,
  };
}
