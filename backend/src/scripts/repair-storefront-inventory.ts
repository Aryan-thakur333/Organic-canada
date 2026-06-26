import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
  linkProductsToSalesChannelWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"

const DEFAULT_STOCK = Math.max(0, Number(process.env.REPAIR_STOCK_QUANTITY || 100))

export default async function repairStorefrontInventory({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
  const storeService: any = container.resolve(Modules.STORE)
  const salesChannelService: any = container.resolve(Modules.SALES_CHANNEL)
  const stockLocationService: any = container.resolve(Modules.STOCK_LOCATION)
  const inventoryService: any = container.resolve(Modules.INVENTORY)
  const apiKeyService: any = container.resolve(Modules.API_KEY)

  const [store] = await storeService.listStores({}, { take: 1 })
  const channels = await salesChannelService.listSalesChannels(
    { is_disabled: false },
    { order: { created_at: "ASC" } }
  )
  const channel = channels.find((item: any) => item.id === store?.default_sales_channel_id) || channels[0]
  if (!channel) throw new Error("No active sales channel exists")

  const locations = await stockLocationService.listStockLocations({}, { order: { created_at: "ASC" } })
  const location = locations[0]
  if (!location) throw new Error("No stock location exists")

  logger.info(`Storefront sales channel: ${channel.name} (${channel.id})`)
  logger.info(`Storefront stock location: ${location.name} (${location.id})`)

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: location.id, add: [channel.id] },
  })
  logger.info("Sales channel is linked to the storefront stock location")

  const publishableKeys = await apiKeyService.listApiKeys({ type: "publishable" })
  for (const key of publishableKeys) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: key.id, add: [channel.id] },
    })
  }
  logger.info(`Verified ${publishableKeys.length} publishable API key link(s)`)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "status",
      "sales_channels.id",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.manage_inventory",
      "variants.inventory_items.inventory_item_id",
    ],
  })

  const publishedProducts = products.filter((product: any) => product.status === "published")
  const productsMissingChannel = publishedProducts
    .filter((product: any) => !product.sales_channels?.some((item: any) => item.id === channel.id))
    .map((product: any) => product.id)

  if (productsMissingChannel.length) {
    await linkProductsToSalesChannelWorkflow(container).run({
      input: { id: channel.id, add: productsMissingChannel },
    })
  }
  logger.info(`Linked ${productsMissingChannel.length} published product(s) to the storefront channel`)

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
  })
  const inventoryBySku = new Map(
    inventoryItems.filter((item: any) => item.sku).map((item: any) => [item.sku, item])
  )
  const inventoryById = new Map(inventoryItems.map((item: any) => [item.id, item]))

  const missingBefore: string[] = []
  const repaired: string[] = []
  const skipped: string[] = []

  for (const product of publishedProducts as any[]) {
    for (const variant of product.variants || []) {
      if (variant.manage_inventory === false) {
        skipped.push(`${variant.id} (${variant.sku || "no sku"}, inventory disabled)`)
        continue
      }

      let inventoryItem = inventoryById.get(variant.inventory_items?.[0]?.inventory_item_id)
      if (!inventoryItem) {
        missingBefore.push(`${variant.id} (${variant.sku || "no sku"})`)
        inventoryItem = variant.sku ? inventoryBySku.get(variant.sku) : undefined

        if (!inventoryItem) {
          const sku = variant.sku || `AUTO-${variant.id}`
          const { result } = await createInventoryItemsWorkflow(container).run({
            input: {
              items: [{
                sku,
                title: `${product.title} - ${variant.title || "Default"}`,
                location_levels: [{
                  location_id: location.id,
                  stocked_quantity: DEFAULT_STOCK,
                }],
              }],
            },
          })
          inventoryItem = result[0]
          inventoryBySku.set(sku, inventoryItem)
          inventoryById.set(inventoryItem.id, inventoryItem)
        }

        await remoteLink.create({
          [Modules.PRODUCT]: { variant_id: variant.id },
          [Modules.INVENTORY]: { inventory_item_id: inventoryItem.id },
        })
      }

      const levels = await inventoryService.listInventoryLevels({
        inventory_item_id: inventoryItem.id,
        location_id: location.id,
      })
      if (!levels.length) {
        await createInventoryLevelsWorkflow(container).run({
          input: {
            inventory_levels: [{
              inventory_item_id: inventoryItem.id,
              location_id: location.id,
              stocked_quantity: DEFAULT_STOCK,
            }],
          },
        })
      }
      repaired.push(`${variant.id} -> ${inventoryItem.id}`)
    }
  }

  const { data: verifiedProducts } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "status",
      "variants.id",
      "variants.sku",
      "variants.manage_inventory",
      "variants.inventory_items.inventory_item_id",
    ],
  })

  const storefrontLevels = await inventoryService.listInventoryLevels({ location_id: location.id })
  const inventoryWithStorefrontLevel = new Set(
    storefrontLevels.map((level: any) => level.inventory_item_id)
  )

  const stillMissing: string[] = []
  for (const product of verifiedProducts as any[]) {
    if (product.status !== "published") continue
    for (const variant of product.variants || []) {
      if (variant.manage_inventory === false) continue
      const items = variant.inventory_items || []
      const hasLevel = items.some((item: any) =>
        inventoryWithStorefrontLevel.has(item.inventory_item_id)
      )
      if (!items.length || !hasLevel) stillMissing.push(`${variant.id} (${variant.sku || "no sku"})`)
    }
  }

  logger.info(`Managed variants verified: ${repaired.length}`)
  logger.info(`Variants missing before repair: ${missingBefore.length}`)
  missingBefore.forEach((variant) => logger.info(`  repaired: ${variant}`))
  skipped.forEach((variant) => logger.info(`  skipped: ${variant}`))

  if (stillMissing.length) {
    stillMissing.forEach((variant) => logger.error(`  MISSING: ${variant}`))
    throw new Error(`${stillMissing.length} managed variant(s) still lack storefront inventory`)
  }

  logger.info("Storefront inventory repair completed with no missing managed variants")
}
