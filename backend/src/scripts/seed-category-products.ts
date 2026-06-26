import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  linkProductsToSalesChannelWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateProductsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

const STOCK_QUANTITY = Math.max(1, Number(process.env.CATEGORY_SEED_STOCK || 100))

const categories = [
  {
    name: "Fruits",
    handle: "fruits",
    description: "Fresh organic fruit sourced for Canadian grocery delivery.",
    products: [
      ["Organic Apples", "organic-apples", 499, "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=900&q=80"],
      ["Fresh Bananas", "fresh-bananas", 299, "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=900&q=80"],
      ["Red Strawberries", "red-strawberries", 699, "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=900&q=80"],
      ["Green Grapes", "green-grapes", 599, "https://images.unsplash.com/photo-1537640538966-79f369143f8f?auto=format&fit=crop&w=900&q=80"],
      ["Sweet Mangoes", "sweet-mangoes", 799, "https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=900&q=80"],
    ],
  },
  {
    name: "Vegetables",
    handle: "vegetables",
    description: "Crisp organic vegetables for everyday meals.",
    products: [
      ["Organic Carrots", "organic-carrots", 399, "https://images.unsplash.com/photo-1445282768818-728615cc910a?auto=format&fit=crop&w=900&q=80"],
      ["Fresh Broccoli", "fresh-broccoli", 449, "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=900&q=80"],
      ["Green Spinach", "green-spinach", 499, "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=900&q=80"],
      ["Red Tomatoes", "red-tomatoes", 399, "https://images.unsplash.com/photo-1546470427-e26264be0b0d?auto=format&fit=crop&w=900&q=80"],
      ["Organic Potatoes", "organic-potatoes", 549, "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=900&q=80"],
    ],
  },
  {
    name: "Dairy",
    handle: "dairy",
    description: "Fresh dairy staples from trusted Canadian producers.",
    products: [
      ["Organic Milk", "organic-milk", 649, "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=900&q=80"],
      ["Greek Yogurt", "greek-yogurt", 599, "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80"],
      ["Cheddar Cheese", "cheddar-cheese", 799, "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=900&q=80"],
      ["Fresh Butter", "fresh-butter", 549, "https://images.unsplash.com/photo-1589985270958-12a44618d4ff?auto=format&fit=crop&w=900&q=80"],
      ["Paneer Block", "paneer-block", 699, "https://images.unsplash.com/photo-1631452180539-96aca7d48617?auto=format&fit=crop&w=900&q=80"],
    ],
  },
  {
    name: "Bakery",
    handle: "bakery",
    description: "Bakery goods made for fresh grocery baskets.",
    products: [
      ["Whole Wheat Bread", "whole-wheat-bread", 499, "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80"],
      ["Croissant", "croissant", 349, "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=80"],
      ["Sourdough Loaf", "sourdough-loaf", 699, "https://images.unsplash.com/photo-1585478259715-876acc5be8eb?auto=format&fit=crop&w=900&q=80"],
      ["Muffins Pack", "muffins-pack", 899, "https://images.unsplash.com/photo-1607958996333-41aef7caefaa?auto=format&fit=crop&w=900&q=80"],
      ["Organic Cookies", "organic-cookies", 649, "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=900&q=80"],
    ],
  },
  {
    name: "Meat",
    handle: "meat",
    description: "Quality meat cuts prepared for reliable home cooking.",
    products: [
      ["Chicken Breast", "chicken-breast", 1299, "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=900&q=80"],
      ["Lamb Chops", "lamb-chops", 1899, "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=900&q=80"],
      ["Turkey Slices", "turkey-slices", 1099, "https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?auto=format&fit=crop&w=900&q=80"],
      ["Beef Steak", "beef-steak", 2299, "https://images.unsplash.com/photo-1603048297172-c92544798d5a?auto=format&fit=crop&w=900&q=80"],
      ["Chicken Sausages", "chicken-sausages", 999, "https://images.unsplash.com/photo-1599585335236-4f22598a9fb8?auto=format&fit=crop&w=900&q=80"],
    ],
  },
  {
    name: "Seafood",
    handle: "seafood",
    description: "Fresh seafood favorites for Canadian kitchens.",
    products: [
      ["Salmon Fillet", "salmon-fillet", 1999, "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=900&q=80"],
      ["Fresh Prawns", "fresh-prawns", 1699, "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=900&q=80"],
      ["Tuna Steak", "tuna-steak", 1899, "https://images.unsplash.com/photo-1501595091296-3aa970afb3ff?auto=format&fit=crop&w=900&q=80"],
      ["Crab Meat", "crab-meat", 2199, "https://images.unsplash.com/photo-1559737558-2f5a35f4523b?auto=format&fit=crop&w=900&q=80"],
      ["White Fish Fillet", "white-fish-fillet", 1499, "https://images.unsplash.com/photo-1600699899970-b1c9fadd8f9e?auto=format&fit=crop&w=900&q=80"],
    ],
  },
] as const

const isDuplicate = (error: any) =>
  /already exists|duplicate|multiple links/i.test(String(error?.message || error))

async function ensureLink(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    if (!isDuplicate(error)) throw error
  }
}

function productPayload(
  product: readonly [string, string, number, string],
  categoryId: string,
  channelId: string,
  shippingProfileId: string
) {
  const [title, handle, amount, image] = product
  return {
    title,
    handle,
    description: `${title} for Eatsie grocery delivery. Fresh, high quality, and ready for Canadian households.`,
    status: ProductStatus.PUBLISHED,
    thumbnail: image,
    images: [{ url: image }],
    categories: [{ id: categoryId }],
    shipping_profile_id: shippingProfileId,
    sales_channels: [{ id: channelId }],
    options: [{ title: "Package", values: ["Standard"] }],
    variants: [{
      title: "Standard",
      sku: `EATSIE-${handle.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
      manage_inventory: true,
      allow_backorder: false,
      options: { Package: "Standard" },
      prices: [{ amount, currency_code: "cad" }],
    }],
  }
}

export default async function seedCategoryProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
  const storeService: any = container.resolve(Modules.STORE)
  const salesChannelService: any = container.resolve(Modules.SALES_CHANNEL)
  const regionService: any = container.resolve(Modules.REGION)
  const fulfillmentService: any = container.resolve(Modules.FULFILLMENT)
  const stockLocationService: any = container.resolve(Modules.STOCK_LOCATION)
  const inventoryService: any = container.resolve(Modules.INVENTORY)
  const apiKeyService: any = container.resolve(Modules.API_KEY)

  const [store] = await storeService.listStores({}, { take: 1 })
  if (!store) throw new Error("No Medusa store exists")

  let [channel] = await salesChannelService.listSalesChannels({
    id: store.default_sales_channel_id ? [store.default_sales_channel_id] : undefined,
  })
  if (!channel) {
    const channels = await salesChannelService.listSalesChannels({ is_disabled: false }, { take: 1 })
    channel = channels[0]
  }
  if (!channel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
    })
    channel = result[0]
  }
  await updateStoresWorkflow(container).run({
    input: { selector: { id: store.id }, update: { default_sales_channel_id: channel.id } },
  })

  let [region] = await regionService.listRegions({ currency_code: "cad" }, { take: 1 })
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [{
          name: "Canada",
          currency_code: "cad",
          countries: ["ca"],
          payment_providers: ["pp_system_default"],
        }],
      },
    })
    region = result[0]
  }
  logger.info(`Using CAD region ${region.id}`)

  let [shippingProfile] = await fulfillmentService.listShippingProfiles({ type: "default" }, { take: 1 })
  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    })
    shippingProfile = result[0]
  }

  let [location] = await stockLocationService.listStockLocations({}, { take: 1 })
  if (!location) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [{
          name: "Eatsie Canada Warehouse",
          address: { city: "Toronto", country_code: "CA", address_1: "Eatsie Grocery Hub" },
        }],
      },
    })
    location = result[0]
  }
  await updateStoresWorkflow(container).run({
    input: { selector: { id: store.id }, update: { default_location_id: location.id } },
  })

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: location.id, add: [channel.id] },
  })
  await ensureLink(() => remoteLink.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  }))

  const publishableKeys = await apiKeyService.listApiKeys({ type: "publishable" })
  for (const key of publishableKeys) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: key.id, add: [channel.id] },
    })
  }

  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "handle"],
    filters: { handle: categories.map((category) => category.handle) as any },
  })
  const categoryByHandle = new Map(existingCategories.map((category: any) => [category.handle, category]))

  for (const category of categories) {
    if (!categoryByHandle.has(category.handle)) {
      const { result } = await createProductCategoriesWorkflow(container).run({
        input: {
          product_categories: [{
            name: category.name,
            handle: category.handle,
            description: category.description,
            is_active: true,
            is_internal: false,
          }],
        },
      })
      categoryByHandle.set(category.handle, result[0])
    }
  }

  const productHandles = categories.flatMap((category) =>
    category.products.map((product) => product[1])
  )
  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.prices.id",
      "variants.prices.currency_code",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { handle: productHandles as any },
  })
  const productByHandle = new Map(existingProducts.map((product: any) => [product.handle, product]))

  const createdProductIds: string[] = []
  const updatedProductIds: string[] = []

  for (const category of categories) {
    const categoryId = categoryByHandle.get(category.handle)?.id
    if (!categoryId) throw new Error(`Unable to resolve category ${category.handle}`)

    for (const catalogProduct of category.products) {
      const payload = productPayload(catalogProduct, categoryId, channel.id, shippingProfile.id)
      const existing = productByHandle.get(payload.handle)

      if (!existing) {
        const { result } = await createProductsWorkflow(container).run({
          input: { products: [payload as any] },
        })
        createdProductIds.push(result[0].id)
        productByHandle.set(payload.handle, result[0])
        continue
      }

      const existingVariant = existing.variants?.[0]
      await updateProductsWorkflow(container).run({
        input: {
          products: [{
            id: existing.id,
            title: payload.title,
            handle: payload.handle,
            description: payload.description,
            thumbnail: payload.thumbnail,
            images: [{ url: payload.thumbnail }],
            status: ProductStatus.PUBLISHED,
            categories: [{ id: categoryId }],
            sales_channels: [{ id: channel.id }],
            shipping_profile_id: shippingProfile.id,
            variants: existingVariant ? [{
              id: existingVariant.id,
              title: "Standard",
              sku: payload.variants[0].sku,
              manage_inventory: true,
              allow_backorder: false,
              prices: [{
                id: existingVariant.prices?.find((price: any) => price.currency_code === "cad")?.id,
                amount: payload.variants[0].prices[0].amount,
                currency_code: "cad",
              }],
            }] : undefined,
          } as any],
        },
      })
      updatedProductIds.push(existing.id)
    }
  }

  const { data: seededProducts } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "status",
      "categories.handle",
      "sales_channels.id",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.manage_inventory",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { handle: productHandles as any },
  })

  const countsByCategory = Object.fromEntries(
    categories.map((category) => [category.handle, 0])
  ) as Record<string, number>
  const productsWithoutVariant: string[] = []

  for (const product of seededProducts as any[]) {
    for (const category of product.categories || []) {
      if (category.handle in countsByCategory) {
        countsByCategory[category.handle] += 1
      }
    }
    if (!product.variants?.length) {
      productsWithoutVariant.push(product.handle)
    }
  }

  const underfilledCategories = Object.entries(countsByCategory)
    .filter(([, count]) => count < 5)
    .map(([handle, count]) => `${handle}:${count}`)

  if (underfilledCategories.length) {
    throw new Error(`Category seed verification failed: ${underfilledCategories.join(", ")}`)
  }
  if (productsWithoutVariant.length) {
    throw new Error(`Seeded products missing variants: ${productsWithoutVariant.join(", ")}`)
  }

  const missingChannel = seededProducts
    .filter((product: any) => !product.sales_channels?.some((item: any) => item.id === channel.id))
    .map((product: any) => product.id)
  if (missingChannel.length) {
    await linkProductsToSalesChannelWorkflow(container).run({
      input: { id: channel.id, add: missingChannel },
    })
  }

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
  })
  const inventoryById = new Map(inventoryItems.map((item: any) => [item.id, item]))
  const inventoryBySku = new Map(inventoryItems.filter((item: any) => item.sku).map((item: any) => [item.sku, item]))

  for (const product of seededProducts as any[]) {
    for (const variant of product.variants || []) {
      let inventoryItem = inventoryById.get(variant.inventory_items?.[0]?.inventory_item_id)

      if (!inventoryItem) {
        inventoryItem = inventoryBySku.get(variant.sku)
      }

      if (!inventoryItem) {
        const { result } = await createInventoryItemsWorkflow(container).run({
          input: {
            items: [{
              sku: variant.sku,
              title: `${product.handle} - ${variant.title || "Standard"}`,
              location_levels: [{ location_id: location.id, stocked_quantity: STOCK_QUANTITY }],
            }],
          },
        })
        inventoryItem = result[0]
        inventoryById.set(inventoryItem.id, inventoryItem)
        inventoryBySku.set(inventoryItem.sku, inventoryItem)
      }

      if (!variant.inventory_items?.some((item: any) => item.inventory_item_id === inventoryItem.id)) {
        await ensureLink(() => remoteLink.create({
          [Modules.PRODUCT]: { variant_id: variant.id },
          [Modules.INVENTORY]: { inventory_item_id: inventoryItem.id },
        }))
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
              stocked_quantity: STOCK_QUANTITY,
            }],
          },
        })
      }
    }
  }

  logger.info(JSON.stringify({
    event: "category_product_seed_completed",
    category_handles: categories.map((category) => category.handle),
    product_count: productHandles.length,
    created_product_count: createdProductIds.length,
    updated_product_count: updatedProductIds.length,
    category_counts: countsByCategory,
    sales_channel_id: channel.id,
    stock_location_id: location.id,
    shipping_profile_id: shippingProfile.id,
  }))
}
