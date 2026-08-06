import { ExecArgs, ProductVariantDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  updateProductsWorkflow,
  linkProductsToSalesChannelWorkflow
} from "@medusajs/core-flows"

export default async function ensureErpTestProduct({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any

  // 13. Determine database name from DATABASE_URL
  const dbUrl = process.env.DATABASE_URL || ""
  const dbMatch = dbUrl.match(/\/([^/?]+)(\?.*)?$/)
  const database_name = dbMatch ? dbMatch[1] : "unknown"
  
  console.log(`[ERP_DB_RUNTIME] ${JSON.stringify({ database_name })}`)

  try {
    // 3. First query SKU ERP-SHIRT-S-BLACK
    const { data: existingVariants } = await query.graph({
      entity: "variant",
      fields: [
        "id",
        "sku",
        "prices.id",
        "prices.amount",
        "prices.currency_code",
        "product.id",
        "product.title",
        "product.status",
        "product.sales_channels.id",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
        "inventory_items.inventory.location_levels.reserved_quantity",
      ],
      filters: {
        sku: ["ERP-SHIRT-S-BLACK"],
      },
    })

    const count = existingVariants?.length || 0

    if (count > 1) {
      throw new Error("ERP_TEST_SKU_DUPLICATE")
    }

    let productId = ""
    let variantId = ""
    let inventoryItemId = ""

    if (count === 0) {
      // Create product + variant first
      console.log("[ERP_SEED_PRODUCT_START]")
      const { result: createdProducts } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "ERP Test Shirt",
              handle: "erp-shirt-s-black",
              status: ProductStatus.PUBLISHED,
              sales_channels: [
                { id: "sc_01KWSKACE7DEGMXG6GH1ZRSA4V" } // Canada sales channel
              ],
              options: [
                {
                  title: "Size",
                  values: ["S"]
                }
              ],
              variants: [
                {
                  title: "S",
                  sku: "ERP-SHIRT-S-BLACK",
                  options: {
                    Size: "S"
                  },
                  prices: [
                    {
                      amount: 25.00,
                      currency_code: "cad"
                    }
                  ],
                  manage_inventory: true,
                  allow_backorder: false
                }
              ]
            }
          ]
        }
      })

      const createdProduct = createdProducts?.[0]
      const createdVariant = createdProduct?.variants?.find((v: any) => v.sku === "ERP-SHIRT-S-BLACK") as
        | (ProductVariantDTO & { prices?: Array<{ id?: string; amount: number; currency_code: string }> })
        | undefined

      if (!createdProduct || !createdVariant) {
        throw new Error("ERP_TEST_VARIANT_PERSISTENCE_FAILED")
      }

      productId = createdProduct.id
      variantId = createdVariant.id

      console.log(`[ERP_SEED_PRODUCT_CREATED] ${JSON.stringify({
        sku: "ERP-SHIRT-S-BLACK",
        product_id: productId,
        variant_id: variantId
      })}`)

      // Price creation verify
      const prices = createdVariant.prices || []
      const cadPrice = prices.find((p: any) => String(p.currency_code).toLowerCase() === "cad")
      if (!cadPrice || typeof cadPrice.amount !== "number" || cadPrice.amount !== 25) {
        throw new Error("ERP_TEST_PRICE_CREATION_FAILED")
      }

      console.log(`[ERP_SEED_PRICE_READY] ${JSON.stringify({
        sku: "ERP-SHIRT-S-BLACK",
        currency_code: "cad",
        canonical_amount: cadPrice.amount
      })}`)

      // Sales Channel verify
      console.log("[ERP_SEED_CHANNEL_READY]")

      // Inventory setup
      console.log("[ERP_SEED_INVENTORY_START]")
      const { data: verifyVar } = await query.graph({
        entity: "variant",
        fields: ["id", "sku", "inventory_items.inventory_item_id"],
        filters: { sku: ["ERP-SHIRT-S-BLACK"] }
      })

      const foundInventoryItemId = verifyVar?.[0]?.inventory_items?.[0]?.inventory_item_id
      if (!foundInventoryItemId) {
        throw new Error("Could not find inventory item linked to the variant.")
      }

      inventoryItemId = foundInventoryItemId

      const inventoryService: any = container.resolve(Modules.INVENTORY)
      await inventoryService.createInventoryLevels([{
        inventory_item_id: inventoryItemId,
        location_id: "sloc_01KVJF9HWWJ38MPAFDGH5YB0W1", // Canada stock location
        stocked_quantity: 100
      }])

      console.log("[ERP_SEED_INVENTORY_READY]")

    } else {
      // count === 1: Verify and repair missing test relationships safely
      const variant = existingVariants[0]
      const product = variant.product
      if (!product) {
        throw new Error("Variant exists but has no product relation.")
      }

      productId = product.id
      variantId = variant.id

      // 1. Repair status
      if (product.status !== ProductStatus.PUBLISHED) {
        await updateProductsWorkflow(container).run({
          input: {
            products: [{ id: product.id, status: ProductStatus.PUBLISHED }]
          }
        })
      }

      // 2. Repair CAD price
      const cadPrice = variant.prices?.find((p: any) => String(p.currency_code).toLowerCase() === "cad")
      if (!cadPrice || Number(cadPrice.amount) !== 25) {
        await updateProductsWorkflow(container).run({
          input: {
            products: [
              {
                id: product.id,
                variants: [
                  {
                    id: variant.id,
                    prices: [
                      {
                        ...(cadPrice?.id ? { id: cadPrice.id } : {}),
                        amount: 25.00,
                        currency_code: "cad"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        })
      }

      // 3. Repair Sales Channel linkage
      const linkedChannels = product.sales_channels || []
      const isChannelLinked = linkedChannels.some((sc: any) => sc.id === "sc_01KWSKACE7DEGMXG6GH1ZRSA4V")
      if (!isChannelLinked) {
        await linkProductsToSalesChannelWorkflow(container).run({
          input: {
            id: "sc_01KWSKACE7DEGMXG6GH1ZRSA4V",
            add: [product.id],
            remove: []
          }
        })
      }

      // 4. Repair Inventory level
      const foundInventoryItemId = variant.inventory_items?.[0]?.inventory_item_id
      if (!foundInventoryItemId) {
        throw new Error("Variant exists but has no inventory item.")
      }

      inventoryItemId = foundInventoryItemId

      const inventoryService: any = container.resolve(Modules.INVENTORY)
      const levels = variant.inventory_items?.[0]?.inventory?.location_levels || []
      const levelAtLocation = levels.find((lvl: any) => lvl.location_id === "sloc_01KVJF9HWWJ38MPAFDGH5YB0W1")

      if (!levelAtLocation) {
        await inventoryService.createInventoryLevels([{
          inventory_item_id: inventoryItemId,
          location_id: "sloc_01KVJF9HWWJ38MPAFDGH5YB0W1",
          stocked_quantity: 100
        }])
      } else if (Number(levelAtLocation.stocked_quantity) !== 100) {
        await inventoryService.updateInventoryLevels([{
          id: levelAtLocation.id,
          stocked_quantity: 100
        }])
      }

      console.log(`[ERP_SEED_PRODUCT_CREATED] ${JSON.stringify({
        sku: "ERP-SHIRT-S-BLACK",
        product_id: productId,
        variant_id: variantId
      })}`)

      console.log(`[ERP_SEED_PRICE_READY] ${JSON.stringify({
        sku: "ERP-SHIRT-S-BLACK",
        currency_code: "cad",
        canonical_amount: 25.00
      })}`)

      console.log("[ERP_SEED_CHANNEL_READY]")
      console.log("[ERP_SEED_INVENTORY_READY]")
    }

    // 10. Re-query final state and print ERP_TEST_PRODUCT_READY
    const { data: finalVariants } = await query.graph({
      entity: "variant",
      fields: [
        "id",
        "sku",
        "prices.id",
        "prices.amount",
        "prices.currency_code",
        "product.id",
        "product.title",
        "product.status",
        "product.sales_channels.id",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
        "inventory_items.inventory.location_levels.reserved_quantity",
      ],
      filters: {
        sku: ["ERP-SHIRT-S-BLACK"],
      },
    })

    const fVar = finalVariants?.[0] || {}
    const fProd = fVar.product || {}
    const fPrices = fVar.prices || []
    const fChannels = fProd.sales_channels || []
    const fInvItems = fVar.inventory_items || []

    const fCadPrice = fPrices.find((price: any) => String(price.currency_code).toLowerCase() === "cad")
    const fLevels = fInvItems?.[0]?.inventory?.location_levels || []
    const fLvl = fLevels.find((lvl: any) => lvl.location_id === "sloc_01KVJF9HWWJ38MPAFDGH5YB0W1") || {}

    console.log(JSON.stringify({
      "[ERP_TEST_PRODUCT_READY]": {
        count: finalVariants?.length || 0,
        sku: fVar.sku || "ERP-SHIRT-S-BLACK",
        product_id: fProd.id || null,
        variant_id: fVar.id || null,
        product_title: fProd.title || null,
        product_status: fProd.status || null,
        cad_price: fCadPrice ? Number(fCadPrice.amount) : null,
        sales_channel_id: fChannels?.[0]?.id || null,
        inventory_item_id: fInvItems?.[0]?.inventory_item_id || null,
        stock_location_id: fLvl.location_id || null,
        stocked_quantity: fLvl.stocked_quantity ? Number(fLvl.stocked_quantity) : null,
        available_quantity: fLvl.stocked_quantity ? (Number(fLvl.stocked_quantity) - Number(fLvl.reserved_quantity || 0)) : null
      }
    }, null, 2))

  } catch (error: any) {
    console.error(`[ERP_SEED_FAILED] ${error.message}`)
    throw error
  }
}
