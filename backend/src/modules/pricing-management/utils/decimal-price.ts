const DECIMAL = /^(\d+)(?:\.(\d+))?$/

export function normalizeDecimalPrice(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  const match = text.match(DECIMAL)
  if (!match) return null
  const whole = match[1].replace(/^0+(?=\d)/, "") || "0"
  const fraction = (match[2] || "").replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : whole
}

function parts(value: string) { const [whole, fraction = ""] = value.split("."); return { whole, fraction } }
export function compareDecimalPrices(a: unknown, b: unknown): number | null {
  const left = normalizeDecimalPrice(a), right = normalizeDecimalPrice(b)
  if (left === null || right === null) return null
  const x = parts(left), y = parts(right)
  if (x.whole.length !== y.whole.length) return x.whole.length > y.whole.length ? 1 : -1
  if (x.whole !== y.whole) return x.whole > y.whole ? 1 : -1
  const length = Math.max(x.fraction.length, y.fraction.length)
  const xf = x.fraction.padEnd(length,"0"), yf = y.fraction.padEnd(length,"0")
  return xf === yf ? 0 : xf > yf ? 1 : -1
}
export function isPositiveDecimalPrice(value: unknown) { const price = normalizeDecimalPrice(value); return price !== null && compareDecimalPrices(price, "0") === 1 }
