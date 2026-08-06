import { ExecArgs } from "@medusajs/framework/types"

export default async function diagnoseOdooProductInventory({ container }: ExecArgs) {
  const erpService = container.resolve<any>("erp")
  const client = erpService.getClient()

  console.log("----------------------------------------")
  console.log("ODOO PRODUCT INVENTORY CAPABILITY DIAGNOSIS")
  console.log("----------------------------------------")

  // 1. Read product.product ID 51
  try {
    const products = await client.executeKeyword(
      "product.product",
      "search_read",
      [[["id", "=", 51]]],
      {
        fields: [
          "id",
          "name",
          "default_code",
          "type",
          "is_storable",
          "tracking",
          "product_tmpl_id",
          "active",
          "list_price",
          "qty_available",
        ],
        limit: 2,
      }
    )

    console.log("\n[PRODUCT.PRODUCT ID 51]")
    console.log(JSON.stringify(products, null, 2))

    if (products && products.length > 0) {
      const product = products[0]
      const templateId = product.product_tmpl_id?.[0] ?? product.product_tmpl_id

      // 2. Read linked product.template
      if (templateId) {
        try {
          const templates = await client.executeKeyword(
            "product.template",
            "search_read",
            [[["id", "=", templateId]]],
            {
              fields: [
                "id",
                "name",
                "default_code",
                "type",
                "is_storable",
                "tracking",
                "active",
                "list_price",
              ],
              limit: 2,
            }
          )
          console.log("\n[PRODUCT.TEMPLATE]")
          console.log(JSON.stringify(templates, null, 2))
        } catch (err: any) {
          console.error("\n[PRODUCT.TEMPLATE READ FAILED]", err.message)
        }
      }
    }
  } catch (err: any) {
    console.error("\n[PRODUCT.PRODUCT READ FAILED]", err.message)
  }

  // 3. Check stock.quant fields
  try {
    const quantFields = await client.executeKeyword(
      "stock.quant",
      "fields_get",
      [[], ["product_id", "location_id", "quantity", "reserved_quantity", "inventory_quantity", "available_quantity"]]
    )
    console.log("\n[STOCK.QUANT FIELDS]")
    console.log(JSON.stringify(Object.keys(quantFields || {}), null, 2))
  } catch (err: any) {
    console.error("\n[STOCK.QUANT FIELDS_GET FAILED]", err.message)
  }

  // 4. Check product.product fields for type/is_storable/tracking
  try {
    const pFields = await client.executeKeyword(
      "product.product",
      "fields_get",
      [[], ["type", "is_storable", "tracking", "product_tmpl_id"]]
    )
    console.log("\n[PRODUCT.PRODUCT KEY FIELDS]")
    for (const key of ["type", "is_storable", "tracking", "product_tmpl_id"]) {
      const field = pFields?.[key]
      if (field) {
        console.log(`  ${key}: type=${field.type} selection=${JSON.stringify(field.selection || null)}`)
      } else {
        console.log(`  ${key}: NOT AVAILABLE`)
      }
    }
  } catch (err: any) {
    console.error("\n[PRODUCT.PRODUCT KEY FIELDS FAILED]", err.message)
  }

  // 5. Check product.template fields for type/is_storable/tracking
  try {
    const tFields = await client.executeKeyword(
      "product.template",
      "fields_get",
      [[], ["type", "is_storable", "tracking"]]
    )
    console.log("\n[PRODUCT.TEMPLATE KEY FIELDS]")
    for (const key of ["type", "is_storable", "tracking"]) {
      const field = tFields?.[key]
      if (field) {
        console.log(`  ${key}: type=${field.type} selection=${JSON.stringify(field.selection || null)}`)
      } else {
        console.log(`  ${key}: NOT AVAILABLE`)
      }
    }
  } catch (err: any) {
    console.error("\n[PRODUCT.TEMPLATE KEY FIELDS FAILED]", err.message)
  }

  console.log("----------------------------------------")
}