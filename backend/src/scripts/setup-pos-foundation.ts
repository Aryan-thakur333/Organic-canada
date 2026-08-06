import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStockLocationsWorkflow, linkSalesChannelsToStockLocationWorkflow, updateProductsWorkflow, updateRegionsWorkflow } from "@medusajs/core-flows"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"

type ProductCandidate = { id: string; metadata?: Record<string, unknown> | null; sales_channels?: Array<{ id: string }>; variants?: Array<{ barcode?: string | null; upc?: string | null; ean?: string | null; prices?: Array<{ amount: number; currency_code: string }>; inventory_items?: Array<{ inventory?: { location_levels?: Array<{ location_id: string; stocked_quantity: number }> } }> }> }

export default async function setupPosFoundation({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const channelService = container.resolve(Modules.SALES_CHANNEL)
  const locationService = container.resolve(Modules.STOCK_LOCATION)
  const regionService = container.resolve(Modules.REGION)
  const userService = container.resolve(Modules.USER)
  const posService = container.resolve(POS_MODULE) as PosModuleService

  const [posChannel] = await channelService.listSalesChannels({ name: "POS" }, { take: 1 })
  if (!posChannel) throw new Error("Dedicated POS sales channel does not exist")
  const regions = await regionService.listRegions({}, { take: 100 })
  const canadaRegion = regions.find((region) => region.currency_code === "cad")
  const usaRegion = regions.find((region) => region.currency_code === "usd")
  if (!canadaRegion || !usaRegion) throw new Error("Both CAD and USD regions are required")
  for (const region of [canadaRegion, usaRegion]) {
    const regionDetails = await query.graph({ entity: "region", fields: ["id", "payment_providers.id"], filters: { id: region.id } })
    const providerIds = ((regionDetails.data[0] as { payment_providers?: Array<{ id: string }> })?.payment_providers || []).map(({ id }) => id)
    if (!providerIds.includes("pp_pos_cash")) {
      await updateRegionsWorkflow(container).run({ input: { selector: { id: region.id }, update: { payment_providers: [...providerIds, "pp_pos_cash"] } } })
    }
  }

  const existingLocations = await locationService.listStockLocations({}, { take: 100, relations: ["address"] })
  const canadaLocation = existingLocations.find((location) => location.address?.country_code?.toLowerCase() === "ca")
  if (!canadaLocation) throw new Error("No Canadian stock location exists; inventory cannot be inferred or copied")
  let usaLocation = existingLocations.find((location) => location.address?.country_code?.toLowerCase() === "us" && /pos/i.test(location.name))
  if (!usaLocation) {
    const { result } = await createStockLocationsWorkflow(container).run({ input: { locations: [{ name: "USA POS Store", address: { address_1: "POS retail location", city: "Seattle", province: "WA", postal_code: "98101", country_code: "US" } }] } })
    usaLocation = result[0]
    logger.info(`Created inventory-empty USA POS location ${usaLocation.id}`)
  }
  for (const location of [canadaLocation, usaLocation]) {
    await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: location.id, add: [posChannel.id] } })
  }

  const { data } = await query.graph({ entity: "product", fields: ["id", "metadata", "sales_channels.id", "variants.barcode", "variants.upc", "variants.ean", "variants.prices.amount", "variants.prices.currency_code", "variants.inventory_items.inventory.location_levels.location_id", "variants.inventory_items.inventory.location_levels.stocked_quantity"], filters: { status: "published" }, pagination: { take: 10000 } })
  const candidates = (data as ProductCandidate[]).filter((product) => product.metadata?.is_digital !== true && product.metadata?.digital_product !== true).filter((product) => product.variants?.some((variant) => Boolean(variant.barcode || variant.upc || variant.ean) && variant.prices?.some((price) => price.currency_code === "cad" && Number.isSafeInteger(Number(price.amount)) && Number(price.amount) > 0) && variant.inventory_items?.some((item) => item.inventory?.location_levels?.some((level) => level.location_id === canadaLocation.id && Number(level.stocked_quantity) > 0))))
  if (candidates.length) {
    await updateProductsWorkflow(container).run({ input: { products: candidates.map((product) => ({ id: product.id, sales_channels: [...(product.sales_channels || []).map(({ id }) => ({ id })), ...((product.sales_channels || []).some((channel) => channel.id === posChannel.id) ? [] : [{ id: posChannel.id }])] })) } })
  }

  const users = await userService.listUsers({}, { take: 100 })
  const administrator = users.find((user) => user.email === "admin@eatsie.com") || users[0]
  if (!administrator) throw new Error("No Medusa admin user exists for initial POS assignment")
  const desired = [
    { name: "Canada POS Register", code: "CA-POS-01", sales_channel_id: posChannel.id, stock_location_id: canadaLocation.id, region_id: canadaRegion.id, currency_code: "cad" },
    { name: "USA POS Register", code: "US-POS-01", sales_channel_id: posChannel.id, stock_location_id: usaLocation.id, region_id: usaRegion.id, currency_code: "usd" },
  ]
  for (const definition of desired) {
    const existing = (await posService.listPosRegisters({ code: definition.code }, { take: 1 }))[0]
    const register = existing || await posService.createPosRegisters({ ...definition, status: "ACTIVE", metadata: { configured_by: "setup-pos-foundation" } })
    const assigned = (await posService.listPosOperatorAssignments({ register_id: register.id, operator_id: administrator.id }, { take: 1 }))[0]
    if (!assigned) await posService.createPosOperatorAssignments({ register_id: register.id, operator_id: administrator.id, role: "ADMIN", active: true, metadata: { configured_by: "setup-pos-foundation" } })
  }
  logger.info(`[POS_SETUP] channel=${posChannel.id} candidates=${candidates.length} canada_location=${canadaLocation.id} usa_location=${usaLocation.id} operator=${administrator.email}`)
}
