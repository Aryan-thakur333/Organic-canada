/**
 * Must match `payment-server/lib/totals.js` exactly (rounding, tax, discount).
 * @param {Array<{ price?: number; quantity?: number }>} items
 * @param {{ discount?: number }} [opts] discount in dollars (after tax, same as cart promo)
 */
export function computeCheckoutTotals(items, opts = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      totalCents: 0,
      subtotalCents: 0,
      taxCents: 0,
      discountCents: 0,
    };
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
    Math.max(0, Math.round((Number(opts.discount) || 0) * 100))
  );
  const totalCents = Math.max(0, subtotalCents + taxCents - discountCents);

  return {
    subtotal: subtotalCents / 100,
    tax: taxCents / 100,
    discount: discountCents / 100,
    total: totalCents / 100,
    totalCents,
    subtotalCents,
    taxCents,
    discountCents,
  };
}
