/**
 * Safely wrap a value (or null/undefined) into an array.
 *
 * Medusa.js Remote Query (query.graph) may return:
 *   - `undefined` when no data exists
 *   - a plain object when only one record matches
 *   - an array when multiple records match
 *
 * `asArray` normalises all three cases so downstream code can always
 * iterate without guard clauses.
 *
 * Examples
 * --------
 *   asArray(undefined)            → []
 *   asArray(null)                 → []
 *   asArray({ id: 1 })            → [{ id: 1 }]
 *   asArray([{ id: 1 }, { id: 2 }]) → [{ id: 1 }, { id: 2 }]
 */
export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Safely convert a value to a number, returning a fallback if NaN.
 */
export function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Safely divide two numbers, returning 0 if denominator is 0.
 */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || !Number.isFinite(denominator)) return fallback
  const result = numerator / denominator
  return Number.isFinite(result) ? result : fallback
}

/**
 * Safely compute a percentage (numerator / denominator * 100).
 */
export function safePct(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0
  const result = (numerator / denominator) * 100
  return Number.isFinite(result) ? result : 0
}
