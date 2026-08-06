export type RegionSafetyInput = {
  regionId?: string | null
  regionCurrency?: string | null
  orderCurrency?: string | null
  countryCode?: string | null
  regionCountryCodes?: string[] | null
  items?: Array<{ metadata?: Record<string, unknown> | null } | null>
}

export function validateRegionCurrency(input: RegionSafetyInput): string[] {
  const reasons: string[] = []
  const currency = input.orderCurrency?.toLowerCase()
  const regionCurrency = input.regionCurrency?.toLowerCase()
  const country = input.countryCode?.toLowerCase()
  const regionCountries = (input.regionCountryCodes || []).map((value) => value.toLowerCase())

  if (!input.regionId) reasons.push("REGION_MISSING")
  if (!currency) reasons.push("CURRENCY_MISSING")
  if (currency && regionCurrency && currency !== regionCurrency) reasons.push("REGION_CURRENCY_MISMATCH")
  if (country === "ca" && currency !== "cad") reasons.push("CANADA_REQUIRES_CAD")
  if (country === "us" && currency !== "usd") reasons.push("USA_REQUIRES_USD")
  if (regionCountries.includes("ca") && currency !== "cad") reasons.push("CANADA_REQUIRES_CAD")
  if (regionCountries.includes("us") && currency !== "usd") reasons.push("USA_REQUIRES_USD")
  if (country && regionCountries.length && !regionCountries.includes(country)) reasons.push("SHIPPING_COUNTRY_OUTSIDE_REGION")
  if (currency && !["cad", "usd"].includes(currency)) reasons.push("UNSUPPORTED_OMS_CURRENCY")

  for (const item of input.items || []) {
    const metadata = item?.metadata || {}
    const itemCurrency = String(metadata.price_currency_code || metadata.currency_code || "").toLowerCase()
    const itemRegion = String(metadata.price_region_id || metadata.region_id || "")
    if (itemCurrency && currency && itemCurrency !== currency) reasons.push("INVALID_ITEM_PRICE_CURRENCY")
    if (itemRegion && input.regionId && itemRegion !== input.regionId) reasons.push("INVALID_ITEM_PRICE_REGION")
  }

  return [...new Set(reasons)]
}
