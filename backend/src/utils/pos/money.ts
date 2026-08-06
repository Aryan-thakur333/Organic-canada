import { PosError } from "./contracts"

export function currencyMinorFactor(currencyCode: string): number {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: currencyCode.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2
    return 10 ** digits
  } catch {
    throw new PosError("POS_CURRENCY_MISMATCH", `Unsupported currency code ${currencyCode}`, 422)
  }
}

export function normalizeMedusaAmount(value: unknown, fieldName?: string): number {
  if (value === undefined || value === null) {
    if (fieldName) {
      throw new PosError("POS_NATIVE_TOTALS_NOT_HYDRATED", `Required computed total field missing: ${fieldName}`, 500, { missing_field: fieldName })
    }
    return 0
  }
  if (typeof value === "number") {
    if (Number.isNaN(value) && fieldName) {
      throw new PosError("POS_NATIVE_TOTALS_NOT_HYDRATED", `Field ${fieldName} is NaN`, 500, { missing_field: fieldName })
    }
    return value
  }
  if (typeof value === "string") return Number(value)
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    if ("numeric" in obj && typeof obj.numeric === "number") return obj.numeric
    if ("value" in obj && typeof obj.value === "string") return Number(obj.value)
    const str = String(value)
    if (str !== "[object Object]") return Number(str)
  }
  return Number(value)
}

export function nativeAmountToMinor(value: unknown, currencyCode: string, field = "amount"): number {
  const amount = normalizeMedusaAmount(value)
  if (!Number.isFinite(amount) || amount < 0) throw new PosError("POS_TOTAL_MISMATCH", `${field} is invalid`, 500)
  const minor = Math.round((amount + Number.EPSILON) * currencyMinorFactor(currencyCode))
  if (!Number.isSafeInteger(minor)) throw new PosError("POS_TOTAL_MISMATCH", `${field} cannot be represented in minor units`, 500)
  return minor
}

export function minorAmountToNative(value: unknown, currencyCode: string, field = "amount_minor"): number {
  const minor = Number(value)
  if (!Number.isSafeInteger(minor) || minor < 0) throw new PosError("POS_VALIDATION_ERROR", `${field} must be a non-negative integer`, 400)
  return minor / currencyMinorFactor(currencyCode)
}
