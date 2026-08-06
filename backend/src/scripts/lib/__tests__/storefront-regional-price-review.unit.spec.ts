import { HIGH_PRICE_REVIEW_THRESHOLD, parseApprovedAmount, priceFlags } from "../storefront-regional-price-review"

describe("storefront regional merchant review rules", () => {
  it("flags missing currencies and keeps review thresholds non-corrective", () => {
    expect(priceFlags({ prices: [{ currency_code: "cad", amount: 600 }] }, "usd")).toContain("MISSING_USD")
    expect(priceFlags({ prices: [{ currency_code: "usd", amount: HIGH_PRICE_REVIEW_THRESHOLD }] }, "usd")).toContain("HIGH_USD_REVIEW")
  })
  it("accepts positive major-unit decimals but rejects zero, negative, and unsafe syntax", () => {
    expect(parseApprovedAmount("16.99").value).toBe(16.99)
    expect(parseApprovedAmount("0").reason).toBeTruthy()
    expect(parseApprovedAmount("-1").reason).toBeTruthy()
    expect(parseApprovedAmount("1,000").reason).toBeTruthy()
  })
})
