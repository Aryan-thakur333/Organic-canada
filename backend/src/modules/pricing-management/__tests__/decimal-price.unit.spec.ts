import { APPROVAL_STATUSES, SUPPORTED_CURRENCIES } from "../constants"
import { compareDecimalPrices, isPositiveDecimalPrice, normalizeDecimalPrice } from "../utils/decimal-price"

describe("pricing-management decimal safety", () => {
  it.each([["004.9900","4.99"],["25.00","25"],["0.50","0.5"],[null,null],["",null]])("canonicalizes %s",(value,expected)=>expect(normalizeDecimalPrice(value)).toBe(expected))
  it("does not scale major unit prices",()=>{expect(normalizeDecimalPrice("499")).toBe("499");expect(normalizeDecimalPrice("4.99")).toBe("4.99")})
  it("rejects malformed and scientific notation",()=>{for(const value of ["1e2","NaN","Infinity","-1","1,000","$2"])expect(normalizeDecimalPrice(value)).toBeNull()})
  it("compares without number conversion",()=>{expect(compareDecimalPrices("9007199254740993.01","9007199254740993")).toBe(1);expect(compareDecimalPrices("4.990","4.99")).toBe(0)})
  it("requires positive values",()=>{expect(isPositiveDecimalPrice("0")).toBe(false);expect(isPositiveDecimalPrice("0.01")).toBe(true)})
  it("publishes approved statuses and currencies",()=>{expect(APPROVAL_STATUSES).toContain("approved");expect(SUPPORTED_CURRENCIES).toEqual(["cad","usd"])})
})
