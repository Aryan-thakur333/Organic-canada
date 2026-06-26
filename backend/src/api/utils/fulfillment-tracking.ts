// @ts-nocheck
import type { MedusaRequest } from "@medusajs/framework/http"

const PROVIDER_LABELS: Record<string, string> = {
  manual_manual: "Organic Canada Delivery",
  manual: "Organic Canada Delivery",
  shippo: "Shippo",
  canada_post: "Canada Post",
  ups: "UPS",
  fedex: "FedEx",
  dhl: "DHL",
}

const CANADIAN_WAREHOUSE = {
  name: "Canadian Warehouse",
  address: "Toronto, Ontario, Canada",
}

const asArray = (value: any) => !value ? [] : Array.isArray(value) ? value : [value]

const titleCase = (value: string) =>
  value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")

export const providerDisplayName = (providerId?: string | null) => {
  if (!providerId) return null
  const normalized = String(providerId).toLowerCase()
  return PROVIDER_LABELS[normalized] || titleCase(normalized)
}

const formatLocationAddress = (location: any) => {
  const address = location?.address || location?.stock_location?.address
  const city = address?.city || location?.city
  const province = address?.province || address?.province_code || location?.province
  const country = address?.country_code
    ? String(address.country_code).toUpperCase() === "CA" ? "Canada" : String(address.country_code).toUpperCase()
    : location?.country

  return [city, province, country].filter(Boolean).join(", ") || null
}

async function resolveStockLocations(req: MedusaRequest, locationIds: string[]) {
  if (!locationIds.length) return new Map()

  const query = req.scope.resolve("query")
  try {
    const { data } = await query.graph({
      entity: "stock_location",
      fields: [
        "id",
        "name",
        "address.city",
        "address.province",
        "address.province_code",
        "address.country_code",
      ],
      filters: { id: locationIds },
    })

    return new Map((data || []).map((location: any) => [location.id, location]))
  } catch (error) {
    console.warn("[tracking] Could not resolve stock locations", error)
    return new Map()
  }
}

const trackingNumberFrom = (fulfillment: any) =>
  fulfillment?.metadata?.tracking_number ||
  fulfillment?.metadata?.tracking_code ||
  fulfillment?.tracking_number ||
  fulfillment?.data?.tracking_number ||
  null

const trackingUrlFrom = (fulfillment: any) =>
  fulfillment?.metadata?.tracking_url ||
  fulfillment?.tracking_url ||
  fulfillment?.data?.tracking_url ||
  null

const carrierFrom = (fulfillment: any) =>
  fulfillment?.metadata?.carrier ||
  fulfillment?.metadata?.provider_name ||
  fulfillment?.carrier ||
  fulfillment?.data?.carrier ||
  providerDisplayName(fulfillment?.provider_id) ||
  null

export async function enrichOrderFulfillmentTracking(req: MedusaRequest, order: any) {
  if (!order) return order

  const fulfillments = asArray(order.fulfillments)
  const locationIds = Array.from(new Set(
    fulfillments.map((fulfillment: any) => fulfillment?.location_id).filter(Boolean)
  ))
  const locationsById = await resolveStockLocations(req, locationIds)

  const metadataTracking = order.metadata?.tracking || null
  const vendorTracking = Object.values(order.metadata?.vendor_tracking || {})[0] as any
  const metadataCandidate = metadataTracking || vendorTracking || null

  const enrichedFulfillments = fulfillments.map((fulfillment: any) => {
    const location = locationsById.get(fulfillment.location_id)
    const warehouseName = fulfillment?.metadata?.warehouse_name ||
      location?.name ||
      fulfillment?.location?.name ||
      fulfillment?.stock_location?.name ||
      CANADIAN_WAREHOUSE.name
    const warehouseAddress = formatLocationAddress(location) ||
      formatLocationAddress(fulfillment?.location) ||
      formatLocationAddress(fulfillment?.stock_location) ||
      CANADIAN_WAREHOUSE.address
    const trackingNumber = trackingNumberFrom(fulfillment) || metadataCandidate?.tracking_number || metadataCandidate?.tracking_code || null
    const trackingUrl = trackingUrlFrom(fulfillment) || metadataCandidate?.tracking_url || null
    const carrier = metadataCandidate?.carrier || carrierFrom(fulfillment)

    return {
      ...fulfillment,
      tracking_number: trackingNumber || fulfillment?.tracking_number,
      tracking_url: trackingUrl || fulfillment?.tracking_url,
      carrier: carrier || fulfillment?.carrier,
      display: {
        warehouse_name: warehouseName,
        warehouse_address: warehouseAddress,
        provider_name: fulfillment?.metadata?.provider_name || providerDisplayName(fulfillment.provider_id) || "Organic Canada Delivery",
        tracking_number: trackingNumber || "Tracking pending",
        tracking_url: trackingUrl,
        carrier: carrier || "Organic Canada Delivery",
      },
    }
  })

  const firstFulfillment = enrichedFulfillments[0] || {}
  const trackingNumber = firstFulfillment.display?.tracking_number ||
    metadataCandidate?.tracking_number ||
    metadataCandidate?.tracking_code ||
    "Pending Assignment"

  return {
    ...order,
    fulfillments: enrichedFulfillments,
    tracking_summary: {
      warehouse_name: firstFulfillment.display?.warehouse_name || CANADIAN_WAREHOUSE.name,
      warehouse_address: firstFulfillment.display?.warehouse_address || CANADIAN_WAREHOUSE.address,
      provider_name: firstFulfillment.display?.provider_name || "Organic Canada Delivery",
      tracking_number: trackingNumber,
      tracking_url: firstFulfillment.display?.tracking_url || metadataCandidate?.tracking_url || null,
      carrier: firstFulfillment.display?.carrier || metadataCandidate?.carrier || "Organic Canada Delivery",
    },
  }
}
