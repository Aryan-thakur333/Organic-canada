import { currencyMinorFactor, minorAmountToNative, nativeAmountToMinor } from "../money"

describe("POS native/minor currency boundary", () => {
  it("converts CAD and USD native decimal amounts to integer ledger values", () => {
    expect(currencyMinorFactor("cad")).toBe(100)
    expect(nativeAmountToMinor(18.99, "usd")).toBe(1899)
    expect(nativeAmountToMinor(25, "cad")).toBe(2500)
    expect(minorAmountToNative(1899, "usd")).toBe(18.99)
  })

  it("supports ISO zero-decimal currencies without hardcoded currency lists", () => {
    expect(currencyMinorFactor("jpy")).toBe(1)
    expect(nativeAmountToMinor(500, "jpy")).toBe(500)
  })
})
