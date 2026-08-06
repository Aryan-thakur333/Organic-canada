export function locationSupportsOrder(location: any, countryCode?: string | null, salesChannelId?: string | null): boolean {
  const country = String(countryCode || "").toLowerCase()
  if (!country || !salesChannelId) return false
  const channels = Array.isArray(location?.sales_channels) ? location.sales_channels : []
  if (!channels.some((channel: any) => channel?.id === salesChannelId)) return false
  const addressCountry = String(location?.address?.country_code || "").toLowerCase()
  const zoneCountries = (location?.fulfillment_sets || []).flatMap((set: any) =>
    (set?.service_zones || []).flatMap((zone: any) => (zone?.geo_zones || []).map((geo: any) => String(geo?.country_code || "").toLowerCase()))
  )
  return addressCountry === country && zoneCountries.includes(country)
}
