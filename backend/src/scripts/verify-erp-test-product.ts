import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function verifyErpTestProduct({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  const { data: variants } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "sku",
      "product.id",
      "product.title",
      "product.status",
      "prices.amount",
      "prices.currency_code",
      "product.sales_channels.id",
      "product.sales_channels.name",
      "inventory_items.inventory_item_id",
      "inventory_items.inventory.location_levels.location_id",
      "inventory_items.inventory.location_levels.stocked_quantity",
      "inventory_items.inventory.location_levels.reserved_quantity",
    ],
    filters: {
      sku: ["ERP-SHIRT-S-BLACK"],
    },
  })

  const count = variants?.length || 0

  if (count === 0) {
    console.log(JSON.stringify({
      count: 0,
      variant_id: null,
      product_id: null,
      sku: "ERP-SHIRT-S-BLACK",
      product_title: null,
      product_status: null
    }, null, 2))
    return
  }

  const v = variants[0]
  const p = v.product || {}
  const prices = v.prices || []
  const salesChannels = p.sales_channels || []
  const inventoryItems = v.inventory_items || []

  console.log(JSON.stringify({
    count,
    variant_id: v.id,
    product_id: p.id,
    sku: v.sku,
    product_title: p.title,
    product_status: p.status
  }, null, 2))

  console.log("\n---------------- Detailed Specs ----------------")
  const cadPrice = prices.find((price: any) => String(price.currency_code).toLowerCase() === "cad")
  console.log(`CAD price: ${cadPrice ? cadPrice.amount : "N/A"}`)

  console.log("sales-channel membership:")
  salesChannels.forEach((sc: any) => {
    console.log(` - ${sc.name} (${sc.id})`)
  })

  if (inventoryItems.length === 0) {
    console.log("inventory item ID: N/A")
    console.log("stock location: N/A")
    console.log("stocked quantity: N/A")
    console.log("reserved quantity: N/A")
    console.log("available quantity: N/A")
  } else {
    inventoryItems.forEach((ii: any) => {
      console.log(`inventory item ID: ${ii.inventory_item_id}`)
      const levels = ii.inventory?.location_levels || []
      if (levels.length === 0) {
        console.log(" - No inventory levels mapped")
      } else {
        levels.forEach((lvl: any) => {
          console.log(` - stock location: ${lvl.location_id}`)
          console.log(`   stocked quantity: ${lvl.stocked_quantity}`)
          console.log(`   reserved quantity: ${lvl.reserved_quantity}`)
          console.log(`   available quantity: ${Math.max(0, Number(lvl.stocked_quantity || 0) - Number(lvl.reserved_quantity || 0))}`)
        })
      }
    })
  }
}
