/** Medusa cart / line amounts use the smallest currency unit (e.g. cents). */
export const MINOR_UNIT_FACTOR = 100;

const CURRENCY_PRECISION = {
  usd: 2,
  cad: 2,
};

export function getCurrencyPrecision(currencyCode = "usd") {
  return CURRENCY_PRECISION[String(currencyCode || "usd").toLowerCase()] ?? 2;
}

export function getMinorUnitFactor(currencyOrFactor = "usd") {
  if (typeof currencyOrFactor === "number") return currencyOrFactor;
  return 10 ** getCurrencyPrecision(currencyOrFactor);
}

/**
 * @param {number | string | null | undefined} amountMinor
 * @param {number | string} [currencyOrFactor]
 * @returns {number}
 */
export function minorToMajor(amountMinor, currencyOrFactor = MINOR_UNIT_FACTOR) {
  const n = Number(amountMinor);
  if (!Number.isFinite(n)) return 0;
  return n / getMinorUnitFactor(currencyOrFactor);
}

/**
 * @param {number | string | null | undefined} amountMajor
 * @param {number | string} [currencyOrFactor]
 * @returns {number}
 */
export function majorToMinor(amountMajor, currencyOrFactor = MINOR_UNIT_FACTOR) {
  const n = Number(amountMajor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * getMinorUnitFactor(currencyOrFactor));
}

/**
 * @param {number} amountMajor
 * @param {string} [currencyCode]
 * @param {string} [locale]
 * @returns {string}
 */
export function formatMoney(amountMajor, currencyCode = "usd", locale = undefined) {
  return formatCurrency(amountMajor, currencyCode, locale);
}

export function getLocaleForCurrency(currencyCode = "usd") {
  const code = String(currencyCode || "usd").toLowerCase();
  if (code === "cad") return "en-CA";
  return "en-US";
}

export function formatCurrency(amountMajor, currencyCode = "usd", locale = undefined) {
  const amount = Number(amountMajor);
  if (!Number.isFinite(amount)) return "";

  const code = String(currencyCode || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}
