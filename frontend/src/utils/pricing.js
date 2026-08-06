import { formatCurrency, getLocaleForCurrency } from '../lib/medusa/money';
import { getProductDisplayPrice, getProductPrice, getVariantDisplayPrice } from './productPricing';

export function getDisplayPrice(productOrVariant, context = {}) {
  if (!productOrVariant) {
    return {
      amount: 0,
      originalAmount: null,
      currencyCode: 'USD',
      hasPrice: false,
      hasCalculatedPrice: false,
      formatted: 'Price unavailable in this region',
      originalFormatted: null,
    };
  }

  const isProduct = Array.isArray(productOrVariant.variants);
  const price = isProduct
    ? getProductDisplayPrice(productOrVariant, context)
    : getVariantDisplayPrice(productOrVariant, context);

  const currencyCode = String(price.currencyCode || 'cad').toUpperCase();
  const amount = Number(price.amount);
  const originalAmount = Number(price.originalAmount);
  const hasPrice = price.hasPrice !== false && Number.isFinite(amount);
  const locale = context.locale || getLocaleForCurrency(currencyCode);

  return {
    ...price,
    amount: hasPrice ? amount : null,
    originalAmount: Number.isFinite(originalAmount) ? originalAmount : null,
    currencyCode,
    hasPrice,
    formatted: hasPrice
      ? formatCurrency(amount, currencyCode, locale)
      : 'Price unavailable in this region',
    originalFormatted: Number.isFinite(originalAmount)
      ? formatCurrency(originalAmount, currencyCode, locale)
      : null,
  };
}

export { getProductDisplayPrice, getProductPrice, getVariantDisplayPrice };
