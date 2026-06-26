/**
 * Safely convert a value to a number, returning a fallback if the result
 * is NaN, Infinity, or undefined.
 */
export const safeNumber = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Safely divide two numbers, returning a fallback instead of NaN.
 * Useful for percentage calculations and averages.
 */
export const safeDivide = (numerator, denominator, fallback = 0) => {
  const num = safeNumber(numerator)
  const den = safeNumber(denominator)
  if (den === 0) return fallback
  return num / den
}

/**
 * Safely convert cents to dollars, returning 0 for NaN.
 */
export const centsToDollars = (cents) => {
  return safeDivide(safeNumber(cents), 100)
}

/**
 * Ensure a value is at least 1 (for progress bars, max attributes, etc.)
 */
export const safeMax = (value, min = 1) => {
  return Math.max(safeNumber(value), min)
}

export default safeNumber
