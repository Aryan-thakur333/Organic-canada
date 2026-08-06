import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type FulfillmentSetGraph = {
  id: string
  name: string
  service_zones?: Array<{ geo_zones?: Array<{ country_code?: string | null }> }>
  location?: { id: string; address?: { country_code?: string | null } }
}

const linkDefinition = (locationId: string, fulfillmentSetId: string) => ({
  [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
  [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSetId },
})

export default async function repairPosUsaFulfillmentLink({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const [locationResult, fulfillmentSetResult] = await Promise.all([
    query.graph({
      entity: "stock_location",
      fields: ["id", "name", "address.country_code"],
      pagination: { take: 100 },
    }),
    query.graph({
      entity: "fulfillment_set",
      fields: [
        "id",
        "name",
        "service_zones.geo_zones.country_code",
        "location.id",
        "location.address.country_code",
      ],
      pagination: { take: 100 },
    }),
  ])

  const locations = locationResult.data as Array<{
    id: string
    name: string
    address?: { country_code?: string | null }
  }>
  const fulfillmentSets = fulfillmentSetResult.data as FulfillmentSetGraph[]
  const usaLocations = locations.filter(
    (location) => location.address?.country_code?.toLowerCase() === "us"
  )
  if (usaLocations.length !== 1) {
    throw new Error(
      `Expected exactly one USA stock location, found ${usaLocations.length}. No links were changed.`
    )
  }

  const usaLocation = usaLocations[0]
  const usaSets = fulfillmentSets.filter((set) =>
    set.service_zones?.some((zone) =>
      zone.geo_zones?.some((geoZone) => geoZone.country_code?.toLowerCase() === "us")
    )
  )
  if (usaSets.length !== 1) {
    throw new Error(
      `Expected exactly one USA fulfillment set, found ${usaSets.length}. No links were changed.`
    )
  }

  const usaSet = usaSets[0]
  const previousLocation = usaSet.location
  if (previousLocation?.id === usaLocation.id) {
    console.log("[POS_USA_FULFILLMENT_REPAIR]")
    console.log(JSON.stringify({ status: "ALREADY_CORRECT", fulfillmentSetId: usaSet.id, usaLocationId: usaLocation.id }, null, 2))
    return
  }

  const oldLink = previousLocation?.id
    ? linkDefinition(previousLocation.id, usaSet.id)
    : null
  const newLink = linkDefinition(usaLocation.id, usaSet.id)

  if (oldLink) {
    await link.dismiss(oldLink)
  }
  try {
    await link.create(newLink)
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: usaLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    }).catch(() => undefined)
  } catch (error) {
    if (oldLink) {
      await link.create(oldLink)
    }
    throw error
  }

  console.log("[POS_USA_FULFILLMENT_REPAIR]")
  console.log(JSON.stringify({
    status: "REPAIRED",
    fulfillmentSetId: usaSet.id,
    previousLocationId: previousLocation?.id || null,
    usaLocationId: usaLocation.id,
    canadaFulfillmentDataChanged: false,
  }, null, 2))
}
