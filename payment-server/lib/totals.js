/**
 * Canonical cart totals (5% tax on subtotal, optional discount in dollars).
 * Must stay in sync with `frontend/src/utils/checkoutTotals.js`.
 * @param {Array<{ price?: number; quantity?: number }>} items
 * @param {{ discount?: number }} [options] discount — dollars subtracted after tax (same as cart promo)
 * @returns {{ subtotal: number; tax: number; total: number; totalCents: number; subtotalCents: number; taxCents: number; discountCents: number }}
 */
export function computeOrderTotals(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart must contain at least one line item.");
  }

  let subtotalCents = 0;
  for (const line of items) {
    const qty = Math.min(99, Math.max(1, Math.floor(Number(line.quantity) || 1)));
    const price = Number(line.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error("Each item must have a valid non-negative price.");
    }
    subtotalCents += Math.round(price * 100) * qty;
  }

  const taxCents = Math.round(subtotalCents * 0.05);
  const maxDiscountCents = subtotalCents + taxCents;
  const discountCents = Math.min(
    maxDiscountCents,
    Math.max(0, Math.round((Number(options.discount) || 0) * 100))
  );
  const totalCents = Math.max(0, subtotalCents + taxCents - discountCents);

  return {
    subtotalCents,
    taxCents,
    discountCents,
    totalCents,
    subtotal: subtotalCents / 100,
    tax: taxCents / 100,
    total: totalCents / 100,
  };
}
