import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"

export default async function auditPosProductionConfig({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pos = container.resolve(POS_MODULE) as PosModuleService
  const payment = container.resolve(Modules.PAYMENT)
  const registers = await pos.listPosRegisters({}, { take: 100 })
  const providers = await payment.listPaymentProviders({}, { take: 100 })
  const result: unknown[] = []
  for (const register of registers) {
    const [locationGraph, regionGraph] = await Promise.all([
      query.graph({ entity: "stock_location", fields: ["id", "name", "address.*", "sales_channels.id"], filters: { id: register.stock_location_id } }),
      query.graph({ entity: "region", fields: ["id", "name", "currency_code", "countries.iso_2", "payment_providers.id", "automatic_taxes"], filters: { id: register.region_id } }),
    ])
    const taxGraph = await query.graph({ entity: "tax_region", fields: ["id", "country_code", "province_code", "parent_id", "provider_id", "tax_rates.id", "tax_rates.code", "tax_rates.rate"], filters: { country_code: String(register.currency_code) === "cad" ? "ca" : "us" } }).catch(() => ({ data: [] }))
    const shippingGraph = await query.graph({ entity: "shipping_option", fields: ["id", "name", "service_zone.fulfillment_set.location.id", "rules.*", "type.code"], pagination: { take: 1000 } }).catch(() => ({ data: [] }))
    const inventory = await query.graph({
      entity: "variant",
      fields: ["id", "sku", "inventory_items.inventory_item_id", "inventory_items.inventory.location_levels.location_id", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity"],
      pagination: { take: 10000 },
    })
    const locationId = String(register.stock_location_id)
    const variants = (inventory.data as Array<Record<string, unknown>>).filter((variant) => JSON.stringify(variant).includes(locationId))
    result.push({ register, location: locationGraph.data[0], region: regionGraph.data[0], tax_regions: taxGraph.data, shipping_options_for_location: shippingGraph.data.filter((option: unknown) => JSON.stringify(option).includes(locationId)), variants_with_location_level: variants.length })
  }
  console.log("[POS_PRODUCTION_CONFIG_AUDIT]")
  console.log(JSON.stringify({ providers: providers.map((provider: { id: string }) => provider.id), registers: result }, null, 2))
}
