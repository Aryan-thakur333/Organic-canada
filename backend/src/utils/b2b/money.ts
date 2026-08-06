export type B2BMoneySource = "frontend_decimal" | "stored_minor" | "auto"

// B2B quote money contract:
// - Human/admin input may be decimal major currency (39.96 CAD).
// - Persisted quote/order/payment amounts are always integer minor units (3996).
// - Provider amounts must compare exactly to the stored negotiated minor-unit total.
export function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function decimalToMinor(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Amount must be a non-negative number")
  }

  return Math.round(n * 100)
}

export function parseHumanMoneyInput(value: unknown): number {
  return decimalToMinor(value)
}

export function storedMinor(value: unknown, fallback = 0): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    return fallback
  }

  return Math.round(n)
}

export function normalizeStoredMinor(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Invalid stored minor amount")
  }

  return Math.round(n)
}

export function calculateLineTotalMinor(unitPriceMinor: number, quantity: number): number {
  return Math.round(unitPriceMinor) * toFiniteNumber(quantity, 0)
}

export function ensureMinorUnitInt(value: unknown, label = "amount"): number {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer minor-unit amount`)
  }

  return n
}

export function normalizeMoneyToMinor(value: unknown, source: B2BMoneySource = "auto"): number {
  if (source === "frontend_decimal") {
    return decimalToMinor(value)
  }

  if (source === "stored_minor") {
    return storedMinor(value)
  }

  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Amount must be a non-negative number")
  }

  return Number.isInteger(n) ? Math.round(n) : decimalToMinor(n)
}

export function moneyEquals(left: unknown, right: unknown): boolean {
  return ensureMinorUnitInt(left, "left amount") === ensureMinorUnitInt(right, "right amount")
}

export function calculateItemsTotalMinor(items: any[] = []): number {
  return items.reduce((sum, item) => {
    const lineTotal = item?.line_total ?? item?.total
    if (Number.isFinite(Number(lineTotal))) {
      return sum + storedMinor(lineTotal)
    }

    const unitPrice = storedMinor(
      item?.negotiated_unit_price ??
        item?.unit_price ??
        item?.requested_unit_price ??
        item?.current_calculated_unit_price ??
        0
    )
    return sum + unitPrice * toFiniteNumber(item?.quantity, 0)
  }, 0)
}

export function getQuoteOriginalTotalMinor(quote: any): number {
  return storedMinor(
    quote?.original_total ??
      quote?.requested_total ??
      quote?.subtotal ??
      quote?.metadata?.original_total ??
      0
  )
}

export function getQuoteNegotiatedTotalMinor(quote: any): number {
  const items = Array.isArray(quote?.negotiated_items)
    ? quote.negotiated_items
    : Array.isArray(quote?.requested_items)
      ? quote.requested_items
      : Array.isArray(quote?.items)
        ? quote.items
        : []

  const fallback = calculateItemsTotalMinor(items)

  return storedMinor(
    quote?.negotiated_total ??
      quote?.total ??
      quote?.requested_total ??
      fallback,
    fallback
  )
}

export function quoteAdjustmentTotalMinor(quote: any): number {
  return getQuoteNegotiatedTotalMinor(quote) - getQuoteOriginalTotalMinor(quote)
}

export function minorToDecimalString(amountMinor: unknown): string {
  return (storedMinor(amountMinor) / 100).toFixed(2)
}

export function minorToDecimal(amountMinor: unknown): number {
  return storedMinor(amountMinor) / 100
}
