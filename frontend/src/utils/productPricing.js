import { resolveRegionPrice } from './resolve-region-price';

function firstFiniteNumber(values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function toNumber(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return 0;
  return number;
}

function getOriginalAmount(variant, calculated) {
  return firstFiniteNumber([
    calculated?.original_amount,
    calculated?.original_price?.amount,
    calculated?.original_price,
  ]);
}

export function getVariantDisplayPrice(variant, context = {}) {
  const calculated = variant?.calculated_price;
  const regionCurrency = context?.region?.currency_code || context?.currencyCode;
  const resolved = resolveRegionPrice(variant, {
    regionId: context?.region?.id || context?.regionId,
    currencyCode: regionCurrency,
  });
  const originalAmount = getOriginalAmount(variant, calculated);
  const hasPrice = resolved.available;

  const price = {
    amount: hasPrice ? toNumber(resolved.amount) : null,
    originalAmount: originalAmount !== null ? toNumber(originalAmount) : null,
    currencyCode:
      resolved.currencyCode || regionCurrency || "usd",
    calculatedPrice: calculated || null,
    hasPrice,
    hasCalculatedPrice: hasPrice,
    source: resolved.source,
    reason: resolved.reason,
    isPriceListPrice: Boolean(
      calculated?.is_calculated_price_price_list ||
      calculated?.calculated_price?.price_list_id
    ),
  };

  if (
    context?.type === 'b2b' &&
    import.meta.env.DEV &&
    price.hasPrice &&
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
  const variant =
    product?.variants?.find((v) => v?.id === context?.variantId) ||
    product?.variants?.[0];
  return getVariantDisplayPrice(variant, context);
}

export function getProductPrice(product, context = {}) {
  const variant = Array.isArray(product?.variants) ? product.variants[0] : product;
  return getVariantDisplayPrice(variant, context);
}
