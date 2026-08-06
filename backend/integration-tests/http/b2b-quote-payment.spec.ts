import {
  calculateItemsTotalMinor,
  calculateLineTotalMinor,
  ensureMinorUnitInt,
  getQuoteNegotiatedTotalMinor,
  getQuoteOriginalTotalMinor,
  minorToDecimal,
  normalizeStoredMinor,
  normalizeMoneyToMinor,
  moneyEquals,
  parseHumanMoneyInput,
  quoteAdjustmentTotalMinor,
} from "../../src/utils/b2b/money"

describe("B2B quote payment money contract", () => {
  test("normalizes frontend decimal input to minor units", () => {
    expect(normalizeMoneyToMinor(39.96, "frontend_decimal")).toBe(3996)
    expect(normalizeMoneyToMinor("0.05", "frontend_decimal")).toBe(5)
    expect(parseHumanMoneyInput("1380")).toBe(138000)
    expect(minorToDecimal(138000)).toBe(1380)
  })

  test("keeps stored quote values as minor units", () => {
    expect(normalizeMoneyToMinor(3996, "stored_minor")).toBe(3996)
    expect(normalizeStoredMinor(3996)).toBe(3996)
    expect(calculateLineTotalMinor(499, 100)).toBe(49900)
    expect(calculateItemsTotalMinor([{ quantity: 123, unit_price: 5 }])).toBe(615)
    expect(ensureMinorUnitInt(615)).toBe(615)
    expect(moneyEquals(615, 615)).toBe(true)
    expect(() => ensureMinorUnitInt(6.15)).toThrow("minor-unit")
  })

  test("uses negotiated total as the payable quote amount", () => {
    const quote = {
      requested_total: 5000,
      original_total: 5000,
      negotiated_total: 3996,
      negotiated_items: [{ quantity: 4, unit_price: 999 }],
    }

    expect(getQuoteOriginalTotalMinor(quote)).toBe(5000)
    expect(getQuoteNegotiatedTotalMinor(quote)).toBe(3996)
    expect(quoteAdjustmentTotalMinor(quote)).toBe(-1004)
  })
})
