import { ExecArgs } from "@medusajs/framework/types"

export default async function inspectOdooSchema({ container }: ExecArgs) {
  const erpService = container.resolve<any>("erp")
  const client = erpService.getClient()

  console.log("----------------------------------------")
  console.log("ODOO 18 SCHEMA INSPECTION START")
  console.log("----------------------------------------")

  try {
    const pFields = await client.executeKeyword(
      "product.product",
      "fields_get",
      [[], ["detailed_type", "type", "is_storable", "active", "list_price", "default_code", "barcode", "product_tmpl_id", "name"]]
    )
    console.log("PRODUCT.PRODUCT FIELDS:")
    console.log(JSON.stringify(pFields, null, 2))
  } catch (err: any) {
    console.error("PRODUCT.PRODUCT FIELDS_GET FAILED:", err.message)
  }

  try {
    const tFields = await client.executeKeyword(
      "product.template",
      "fields_get",
      [[], ["detailed_type", "type", "is_storable", "active", "list_price", "default_code", "barcode", "name"]]
    )
    console.log("\nPRODUCT.TEMPLATE FIELDS:")
    console.log(JSON.stringify(tFields, null, 2))
  } catch (err: any) {
    console.error("PRODUCT.TEMPLATE FIELDS_GET FAILED:", err.message)
  }

  console.log("----------------------------------------")
}
