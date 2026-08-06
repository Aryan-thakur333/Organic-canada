import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"

export default async function auditPosFoundation({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
  const regionService = container.resolve(Modules.REGION)
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
  const paymentService = container.resolve(Modules.PAYMENT)
  const userService = container.resolve(Modules.USER)
  const posService = container.resolve(POS_MODULE) as PosModuleService

  const [channels, regions, locations, providers, users, registers, assignments] = await Promise.all([
    salesChannelService.listSalesChannels({}, { take: 100 }),
    regionService.listRegions({}, { take: 100 }),
    stockLocationService.listStockLocations({}, { take: 100, relations: ["address"] }),
    paymentService.listPaymentProviders({}, { take: 100 }),
    userService.listUsers({}, { take: 100 }),
    posService.listPosRegisters({}, { take: 100 }),
    posService.listPosOperatorAssignments({}, { take: 100 }),
  ])
  const posChannels = channels.filter((channel) => /pos|point of sale/i.test(channel.name))
  let variants: Array<Record<string, unknown>> = []
  try {
    const result = await query.graph({ entity: "variant", fields: ["id", "barcode", "upc", "ean", "sku", "product.id", "product.sales_channels.id", "inventory_items.inventory.location_levels.location_id", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity"], pagination: { take: 10000 } })
    variants = result.data as Array<Record<string, unknown>>
  } catch (error) {
    console.warn("[POS_AUDIT] Variant graph failed", error instanceof Error ? error.message : error)
  }
  const posChannelIds = new Set(posChannels.map((channel) => channel.id))
  const posVariants = variants.filter((variant) => {
    const product = variant.product as { sales_channels?: Array<{ id: string }> } | undefined
    return product?.sales_channels?.some((channel) => posChannelIds.has(channel.id))
  })
  const barcodeEnabled = posVariants.filter((variant) => variant.barcode || variant.upc || variant.ean).length
  const audit = {
    posSalesChannelExists: posChannels.length > 0,
    posSalesChannelId: posChannels[0]?.id || "",
    posSalesChannels: posChannels.map(({ id, name }) => ({ id, name })),
    posLocations: locations.filter((location) => /pos|store/i.test(location.name)).map((location) => ({ id: location.id, name: location.name, country_code: location.address?.country_code || null })),
    allLocations: locations.map((location) => ({ id: location.id, name: location.name, country_code: location.address?.country_code || null })),
    posProducts: new Set(posVariants.map((variant) => (variant.product as { id?: string } | undefined)?.id).filter(Boolean)).size,
    posVariants: posVariants.length,
    barcodeEnabledVariants: barcodeEnabled,
    registerModuleExists: true,
    registers: registers.map((register) => ({ id: register.id, name: register.name, code: register.code, currency_code: register.currency_code, region_id: register.region_id, sales_channel_id: register.sales_channel_id, stock_location_id: register.stock_location_id, status: register.status })),
    operatorAssignments: assignments.length,
    cashPaymentProviderExists: providers.some((provider) => /cash|manual/i.test(provider.id)),
    paymentProviders: providers.map((provider) => provider.id),
    activeCurrencies: regions.map((region) => region.currency_code),
    supportedRegions: regions.map((region) => ({ id: region.id, name: region.name, currency_code: region.currency_code, countries: region.countries?.map((country) => country.iso_2) || [] })),
    users: users.map((user) => ({ id: user.id, email: user.email })),
    posFrontendExists: true,
    remainingBlockers: [
      ...(posChannels.length ? [] : ["Dedicated POS sales channel is missing"]),
      ...(registers.length ? [] : ["No POS registers are configured"]),
      ...(barcodeEnabled ? [] : ["No POS-channel variant has barcode/UPC/EAN data"]),
      ...(providers.some((provider) => /cash|manual/i.test(provider.id)) ? [] : ["No native cash provider; POS cash ledger is custom and native payment collections are marked paid"]),
    ],
  }
  console.log("[POS_FOUNDATION_AUDIT]")
  console.log(JSON.stringify(audit, null, 2))
}
