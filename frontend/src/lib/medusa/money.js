/** Medusa cart / line amounts use the smallest currency unit (e.g. cents). */
export const MINOR_UNIT_FACTOR = 100;

/**
 * @param {number | string | null | undefined} amountMinor
 * @param {number} [factor]
 * @returns {number}
 */
export function minorToMajor(amountMinor, factor = MINOR_UNIT_FACTOR) {
  const n = Number(amountMinor);
  if (!Number.isFinite(n)) return 0;
  return n / factor;
}

/**
 * @param {number | string | null | undefined} amountMajor
 * @param {number} [factor]
 * @returns {number}
 */
export function majorToMinor(amountMajor, factor = MINOR_UNIT_FACTOR) {
  const n = Number(amountMajor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * factor);
}

/**
 * @param {number} amountMajor
 * @param {string} [currencyCode]
 * @param {string} [locale]
 * @returns {string}
 */
export function formatMoney(amountMajor, currencyCode = "usd", locale = undefined) {
  const code = String(currencyCode || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
    }).format(Number(amountMajor) || 0);
  } catch {
    return `${code} ${(Number(amountMajor) || 0).toFixed(2)}`;
  }
}
