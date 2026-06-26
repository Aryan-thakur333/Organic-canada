import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

const COUNTRY_CODE = (process.env.SHIPPING_COUNTRY_CODE || "ca").toLowerCase()
const DEFAULT_PRICE = Math.max(0, Number(process.env.DEFAULT_SHIPPING_PRICE || 0))
const DEFAULT_PROFILE_NAME = "Default Shipping Profile"
const DEFAULT_SET_NAME = "Eatsie Canada Fulfillment"

const isDuplicateLink = (error: any) =>
  /multiple links|already exists|duplicate/i.test(String(error?.message || error))

async function ensureLink(remoteLink: any, definition: Record<string, any>) {
  try {
    await remoteLink.create(definition)
  } catch (error) {
    if (!isDuplicateLink(error)) throw error
  }
}

export default async function repairShippingConfiguration({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment: any = container.resolve(Modules.FULFILLMENT)
  const regionService: any = container.resolve(Modules.REGION)
  const locationService: any = container.resolve(Modules.STOCK_LOCATION)
  const salesChannelService: any = container.resolve(Modules.SALES_CHANNEL)
  const storeService: any = container.resolve(Modules.STORE)

  const [store] = await storeService.listStores({}, { take: 1 })
  const regions = await regionService.listRegions({}, { relations: ["countries"] })
  const region = regions.find((item: any) =>
    item.countries?.some((country: any) => country.iso_2?.toLowerCase() === COUNTRY_CODE)
  ) || regions[0]
  if (!region) throw new Error("No region exists; create a Canada region before repairing shipping")

  const channels = await salesChannelService.listSalesChannels({ is_disabled: false })
  const channel = channels.find((item: any) => item.id === store?.default_sales_channel_id) || channels[0]
  if (!channel) throw new Error("No active sales channel exists")

  const locations = await locationService.listStockLocations({}, { order: { created_at: "ASC" } })
  const location = locations.find((item: any) => item.id === store?.default_location_id) || locations[0]
  if (!location) throw new Error("No stock location exists")

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: location.id, add: [channel.id] },
  })
  await ensureLink(remoteLink, {
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })

  let profiles = await fulfillment.listShippingProfiles()
  let defaultProfile = profiles.find((profile: any) => profile.type === "default")
  if (!defaultProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: DEFAULT_PROFILE_NAME, type: "default" }] },
    })
    defaultProfile = result[0]
    profiles = [...profiles, defaultProfile]
    logger.info(`[shipping-repair] created default profile ${defaultProfile.id}`)
  }

  let sets = await fulfillment.listFulfillmentSets(
    {},
    { relations: ["service_zones", "service_zones.geo_zones"] }
  )
  let fulfillmentSet = sets.find((set: any) => set.type === "shipping" &&
    set.service_zones?.some((zone: any) =>
      zone.geo_zones?.some((geo: any) => geo.country_code?.toLowerCase() === COUNTRY_CODE)
    ))

  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillment.createFulfillmentSets({
      name: DEFAULT_SET_NAME,
      type: "shipping",
      service_zones: [{
        name: "Canada",
        geo_zones: [{ type: "country", country_code: COUNTRY_CODE }],
      }],
    })
    logger.info(`[shipping-repair] created fulfillment set ${fulfillmentSet.id}`)
  }

  await ensureLink(remoteLink, {
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  })

  let serviceZone = fulfillmentSet.service_zones?.find((zone: any) =>
    zone.geo_zones?.some((geo: any) => geo.country_code?.toLowerCase() === COUNTRY_CODE)
  )
  if (!serviceZone) {
    const refreshed = await fulfillment.retrieveFulfillmentSet(fulfillmentSet.id, {
      relations: ["service_zones", "service_zones.geo_zones"],
    })
    serviceZone = refreshed.service_zones?.[0]
  }
  if (!serviceZone) throw new Error(`Fulfillment set ${fulfillmentSet.id} has no service zone`)

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "shipping_profile.id", "variants.id"],
  })
  const missingProducts = products.filter((product: any) => !product.shipping_profile?.id)
  if (missingProducts.length) {
    await updateProductsWorkflow(container).run({
      input: {
        products: missingProducts.map((product: any) => ({
          id: product.id,
          shipping_profile_id: defaultProfile.id,
        })),
      },
    })
  }

  const options = await fulfillment.listShippingOptions(
    {},
    { relations: ["service_zone", "service_zone.fulfillment_set", "rules"] }
  )
  const optionProfiles = new Set(options.map((option: any) => option.shipping_profile_id))
  const createdOptions: string[] = []

  for (const profile of profiles) {
    if (optionProfiles.has(profile.id)) continue
    const { result } = await createShippingOptionsWorkflow(container).run({
      input: [{
        name: `Standard Shipping - ${profile.name}`,
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: serviceZone.id,
        shipping_profile_id: profile.id,
        type: {
          label: "Standard",
          description: "Standard delivery in Canada",
          code: `standard-${profile.id}`,
        },
        prices: [
          { currency_code: region.currency_code, amount: DEFAULT_PRICE },
          { region_id: region.id, amount: DEFAULT_PRICE },
        ],
        rules: [
          { attribute: "enabled_in_store", operator: "eq", value: "true" },
          { attribute: "is_return", operator: "eq", value: "false" },
        ],
      }],
    })
    createdOptions.push(result[0].id)
  }

  const finalOptions = await fulfillment.listShippingOptions(
    {},
    { relations: ["service_zone", "service_zone.fulfillment_set"] }
  )
  const finalProfiles = await fulfillment.listShippingProfiles()
  const profilesWithoutOptions = finalProfiles.filter((profile: any) =>
    !finalOptions.some((option: any) => option.shipping_profile_id === profile.id)
  )

  logger.info(JSON.stringify({
    event: "shipping_configuration_repair",
    region_id: region.id,
    sales_channel_id: channel.id,
    stock_location_id: location.id,
    fulfillment_set_id: fulfillmentSet.id,
    service_zone_id: serviceZone.id,
    default_shipping_profile_id: defaultProfile.id,
    products_audited: products.length,
    variants_audited: products.reduce((sum: number, product: any) => sum + (product.variants?.length || 0), 0),
    products_assigned_default_profile: missingProducts.map((product: any) => product.id),
    shipping_options_created: createdOptions,
    profiles_without_options: profilesWithoutOptions.map((profile: any) => profile.id),
  }))

  if (profilesWithoutOptions.length) {
    throw new Error(`${profilesWithoutOptions.length} shipping profile(s) still have no shipping option`)
  }
  logger.info("[shipping-repair] Product -> Profile -> Fulfillment Set -> Stock Location -> Option verified")
}
