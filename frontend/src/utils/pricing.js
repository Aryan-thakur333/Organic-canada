import { getProductDisplayPrice, getProductPrice, getVariantDisplayPrice } from './productPricing';

export function getDisplayPrice(productOrVariant, context = {}) {
  if (!productOrVariant) {
    return {
      amount: 0,
      originalAmount: null,
      currencyCode: 'cad',
      hasCalculatedPrice: false,
      formatted: '$0.00',
      originalFormatted: null,
    };
  }

  const isProduct = Array.isArray(productOrVariant.variants);
  const price = isProduct
    ? getProductDisplayPrice(productOrVariant, context)
    : getVariantDisplayPrice(productOrVariant, context);

  const currencyCode = String(price.currencyCode || 'cad').toUpperCase();
  const formatter = new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  });

  return {
    ...price,
    amount: Number.isFinite(price.amount) ? price.amount : 0,
    originalAmount: Number.isFinite(price.originalAmount) ? price.originalAmount : null,
    currencyCode,
    formatted: formatter.format(Number.isFinite(price.amount) ? price.amount : 0),
    originalFormatted: Number.isFinite(price.originalAmount)
      ? formatter.format(price.originalAmount)
      : null,
  };
}

export { getProductDisplayPrice, getProductPrice, getVariantDisplayPrice };
