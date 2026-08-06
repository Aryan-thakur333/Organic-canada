import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createInventoryItemsWorkflow, createInventoryLevelsWorkflow, createProductsWorkflow } from "@medusajs/core-flows"

const FIXTURE_HANDLE = "test-pos-production-readiness-fixture"
const FIXTURE_SKU = "TEST-POS-FIXTURE-001"

function positiveInteger(name: string) {
  const value = Number(process.env[name])
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be an explicitly configured positive integer`)
  return value
}

export default async function createPosIsolatedInventoryFixture({ container }: ExecArgs) {
  if (process.env.POS_ALLOW_TEST_INVENTORY_FIXTURE !== "true") {
    throw new Error("POS_ALLOW_TEST_INVENTORY_FIXTURE=true is required; production inventory was not changed")
  }
  const usaQuantity = positiveInteger("POS_TEST_USA_STOCKED_QUANTITY")
  const canadaQuantity = positiveInteger("POS_TEST_CANADA_STOCKED_QUANTITY")
  const usdPrice = positiveInteger("POS_TEST_USD_PRICE_NATIVE")
  const cadPrice = positiveInteger("POS_TEST_CAD_PRICE_NATIVE")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(Modules.FULFILLMENT)
  const inventory = container.resolve(Modules.INVENTORY)

  const [locationsResult, channelsResult, existingResult] = await Promise.all([
    query.graph({ entity: "stock_location", fields: ["id", "address.country_code"], pagination: { take: 100 } }),
    query.graph({ entity: "sales_channel", fields: ["id", "name"], pagination: { take: 100 } }),
    query.graph({ entity: "product", fields: ["id", "handle", "variants.id", "variants.inventory_items.inventory_item_id"], filters: { handle: FIXTURE_HANDLE } }),
  ])
  const locations = locationsResult.data as Array<{ id: string; address?: { country_code?: string } }>
  const canadaLocation = locations.find((location) => location.address?.country_code?.toLowerCase() === "ca")
  const usaLocation = locations.find((location) => location.address?.country_code?.toLowerCase() === "us")
  const posChannel = (channelsResult.data as Array<{ id: string; name: string }>).find((channel) => /^pos$/i.test(channel.name))
  const shippingProfile = (await fulfillment.listShippingProfiles({ type: "default" }, { take: 1 }))[0]
  if (!canadaLocation || !usaLocation || !posChannel || !shippingProfile) {
    throw new Error("Fixture requires one Canada location, one USA location, the POS channel, and a default shipping profile")
  }

  let product = existingResult.data[0] as { id: string; variants?: Array<{ id: string; inventory_items?: Array<{ inventory_item_id: string }> }> } | undefined
  if (!product) {
    const created = await createProductsWorkflow(container).run({
      input: {
        products: [{
          title: "TEST POS Production Readiness Fixture — NOT FOR SALE",
          handle: FIXTURE_HANDLE,
          status: ProductStatus.PUBLISHED,
          metadata: { pos_test_fixture: true, production_inventory: false, created_by: "create-pos-isolated-inventory-fixture" },
          shipping_profile_id: shippingProfile.id,
          sales_channels: [{ id: posChannel.id }],
          options: [{ title: "Fixture", values: ["Test only"] }],
          variants: [{
            title: "TEST ONLY",
            sku: FIXTURE_SKU,
            barcode: FIXTURE_SKU,
            manage_inventory: true,
            allow_backorder: false,
            options: { Fixture: "Test only" },
            prices: [
              { currency_code: "cad", amount: cadPrice },
              { currency_code: "usd", amount: usdPrice },
            ],
          }],
        }],
      },
    })
    product = created.result[0]
  }
  const variant = product.variants?.[0]
  if (!variant) throw new Error("Fixture product has no variant")

  let inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id
  if (!inventoryItemId) {
    const created = await createInventoryItemsWorkflow(container).run({
      input: { items: [{ sku: FIXTURE_SKU, title: "TEST POS fixture inventory" }] },
    })
    inventoryItemId = created.result[0].id
    await link.create({
      [Modules.PRODUCT]: { variant_id: variant.id },
      [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
    })
  }

  const desiredLevels = [
    { location_id: canadaLocation.id, stocked_quantity: canadaQuantity },
    { location_id: usaLocation.id, stocked_quantity: usaQuantity },
  ]
  for (const desired of desiredLevels) {
    const existing = await inventory.listInventoryLevels({ inventory_item_id: inventoryItemId, location_id: desired.location_id })
    if (!existing.length) {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: [{ inventory_item_id: inventoryItemId, ...desired }] },
      })
    } else if (Number(existing[0].stocked_quantity) !== desired.stocked_quantity) {
      throw new Error(`Existing fixture level at ${desired.location_id} differs from explicit configuration; refusing an implicit overwrite`)
    }
  }

  console.log("[POS_ISOLATED_INVENTORY_FIXTURE]")
  console.log(JSON.stringify({
    status: "CONFIGURED",
    fixture: true,
    productionInventoryChanged: false,
    productId: product.id,
    variantId: variant.id,
    inventoryItemId,
    levels: desiredLevels,
  }, null, 2))
}
