function firstFiniteNumber(values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function getB2BVariantPrice(variant) {
  const calculated = variant?.calculated_price;
  const amount = firstFiniteNumber([
    variant?.b2b_price,
    calculated?.calculated_amount,
    calculated?.amount,
    calculated?.calculated_price?.amount,
    variant?.price,
  ]);

  if (import.meta.env.DEV) {
    const original = getOriginalVariantPrice(variant);
    if (amount !== null && original !== null && amount === original) {
      console.warn(`B2B price equals original price for ${variant?.id || 'variant'}. Check price list override.`, {
        variant,
      });
    }
  }

  return amount;
}

export function getOriginalVariantPrice(variant) {
  const calculated = variant?.calculated_price;
  return firstFiniteNumber([
    variant?.original_price,
    calculated?.original_amount,
    variant?.prices?.[0]?.amount,
  ]);
}

export function formatMoney(amount, currencyCode = 'cad') {
  const number = Number(amount);
  const minor = Number.isFinite(number) ? number : 0;
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: String(currencyCode || 'cad').toUpperCase(),
  }).format(minor / 100);
}

export function getB2BDisplayPrice(variant, currencyCode = 'cad') {
  const b2bPrice = getB2BVariantPrice(variant);
  const originalPrice = getOriginalVariantPrice(variant);

  return {
    amount: b2bPrice,
    originalAmount: originalPrice,
    formatted: formatMoney(b2bPrice ?? originalPrice ?? 0, currencyCode),
    originalFormatted: originalPrice !== null ? formatMoney(originalPrice, currencyCode) : null,
    currencyCode: String(variant?.calculated_price?.currency_code || variant?.prices?.[0]?.currency_code || currencyCode || 'cad').toUpperCase(),
  };
}
