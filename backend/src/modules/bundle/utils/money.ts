const CURRENCY_PRECISION: Record<string, number> = {
  // The bundle storefront currently supports these two currencies. Keeping the
  // precision lookup explicit prevents another hard-coded cents conversion.
  usd: 2,
  cad: 2,
}

export function getCurrencyPrecision(currencyCode: string) {
  return CURRENCY_PRECISION[String(currencyCode || "").toLowerCase()] ?? 2
}

export function majorToMinor(amount: number | string, currencyCode: string) {
  const majorAmount = Number(amount)
  if (!Number.isFinite(majorAmount) || majorAmount <= 0) {
    throw new Error("BUNDLE_PRICE_INVALID")
  }

  const factor = 10 ** getCurrencyPrecision(currencyCode)
  const minorAmount = Math.round(majorAmount * factor)
  if (!Number.isSafeInteger(minorAmount) || minorAmount <= 0) {
    throw new Error("BUNDLE_PRICE_MINOR_INVALID")
  }
  return minorAmount
}

export function minorToMajor(amount: number, currencyCode: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("BUNDLE_MINOR_PRICE_INVALID")
  }
  return amount / (10 ** getCurrencyPrecision(currencyCode))
}
