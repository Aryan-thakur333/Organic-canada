import {
  getQuoteNegotiatedTotalMinor,
  getQuoteOriginalTotalMinor,
  minorToDecimalString,
  normalizeMoneyToMinor,
  quoteAdjustmentTotalMinor,
} from "../../src/utils/b2b/money"

describe("B2B quote offline payment money contract", () => {
  test("admin final-offer decimal input is stored as minor units", () => {
    expect(normalizeMoneyToMinor(39.96, "frontend_decimal")).toBe(3996)
    expect(normalizeMoneyToMinor("615.00", "frontend_decimal")).toBe(61500)
  })

  test("customer acceptance uses the stored negotiated minor-unit amount", () => {
    const quote = {
      requested_total: 5000,
      original_total: 5000,
      negotiated_total: 3996,
      payment_state: "awaiting_remittance",
      payment_terms: "net_30",
    }

    expect(getQuoteOriginalTotalMinor(quote)).toBe(5000)
    expect(getQuoteNegotiatedTotalMinor(quote)).toBe(3996)
    expect(quoteAdjustmentTotalMinor(quote)).toBe(-1004)
    expect(minorToDecimalString(getQuoteNegotiatedTotalMinor(quote))).toBe("39.96")
  })

  test("offline settlement keeps payment state separate from quote price", () => {
    const acceptedQuote = {
      status: "accepted",
      negotiated_total: 615,
      payment_state: "awaiting_remittance",
      metadata: {
        settlement_mode: "offline",
      },
    }

    const paidQuote = {
      ...acceptedQuote,
      payment_state: "paid",
      metadata: {
        ...acceptedQuote.metadata,
        payment_reference: "OFFLINE-615",
      },
    }

    expect(getQuoteNegotiatedTotalMinor(acceptedQuote)).toBe(615)
    expect(getQuoteNegotiatedTotalMinor(paidQuote)).toBe(615)
    expect(paidQuote.metadata.payment_reference).toBe("OFFLINE-615")
  })
})
