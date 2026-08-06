import { ExecArgs } from "@medusajs/framework/types"

export default async function repairOdooProductInventory({ container }: ExecArgs) {
  const erpService = container.resolve<any>("erp")

  console.log("----------------------------------------")
  console.log("ODOO PRODUCT 51 INVENTORY REPAIR")
  console.log("----------------------------------------")

  // 1. Read current state
  const capability = await erpService.getProductInventoryCapability(51)
  console.log("\n[BEFORE]")
  console.log(JSON.stringify(capability, null, 2))

  // 2. Repair product 51 to be inventory-trackable
  const result = await erpService.repairOdooProductForInventory(51)
  console.log("\n[REPAIR RESULT]")
  console.log(JSON.stringify(result, null, 2))

  // 3. Verify after repair
  const after = await erpService.getProductInventoryCapability(51)
  console.log("\n[AFTER]")
  console.log(JSON.stringify(after, null, 2))

  // 4. Verify template
  if (after.templateId) {
    const template = await erpService.getProductTemplate(after.templateId)
    console.log("\n[TEMPLATE AFTER]")
    console.log(JSON.stringify(template, null, 2))
  }

  // 5. Verify no duplicate SKU
  const products = await erpService.getProducts({ sku: "ERP-SHIRT-S-BLACK", limit: 10 })
  console.log("\n[SKU COUNT]")
  console.log(JSON.stringify({
    count: products.length,
    ids: products.map((p: any) => p.id)
  }, null, 2))

  console.log("----------------------------------------")
}