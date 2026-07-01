function firstFiniteNumber(values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function toMajorUnits(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return 0;
  return number / 100;
}

function getFallbackPrice(variant) {
  return firstFiniteNumber([
    variant?.prices?.[0]?.amount,
    variant?.price,
    variant?.unit_price,
  ]);
}

function getOriginalAmount(variant, calculated) {
  return firstFiniteNumber([
    calculated?.original_amount,
    calculated?.original_price?.amount,
    calculated?.original_price,
    getFallbackPrice(variant),
  ]);
}

export function getVariantDisplayPrice(variant, context = {}) {
  const calculated = variant?.calculated_price;
  const calculatedAmount = firstFiniteNumber([
    calculated?.calculated_amount,
    calculated?.amount,
  ]);
  const fallbackAmount = getFallbackPrice(variant);
  const amount = calculatedAmount ?? fallbackAmount ?? 0;
  const originalAmount = getOriginalAmount(variant, calculated);
  const hasCalculatedPrice = calculatedAmount !== null;

  const price = {
    amount: toMajorUnits(amount),
    originalAmount: originalAmount !== null ? toMajorUnits(originalAmount) : null,
    currencyCode:
      calculated?.currency_code || variant?.prices?.[0]?.currency_code || "cad",
    hasCalculatedPrice,
    isPriceListPrice: Boolean(
      calculated?.is_calculated_price_price_list ||
      calculated?.calculated_price?.price_list_id
    ),
  };

  if (
    context?.type === 'b2b' &&
    import.meta.env.DEV &&
    price.hasCalculatedPrice &&
    price.originalAmount !== null &&
    price.originalAmount === price.amount
  ) {
    console.warn('B2B price list did not change this product price. Check price list override/customer group.', {
      variantId: variant?.id,
      calculated_price: calculated,
      prices: variant?.prices,
    });
  }

  return price;
}

export function getProductDisplayPrice(product, context = {}) {
  return getVariantDisplayPrice(product?.variants?.[0], context);
}

export function getProductPrice(product, context = {}) {
  const variant = Array.isArray(product?.variants) ? product.variants[0] : product;
  return getVariantDisplayPrice(variant, context);
}
