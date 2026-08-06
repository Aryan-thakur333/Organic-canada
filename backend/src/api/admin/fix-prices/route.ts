import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ProductStatus } from "@medusajs/framework/utils"

export default async function (req: MedusaRequest, res: MedusaResponse) {
  const productService = req.scope.resolve("product")
  
  const applyFix = req.query.APPLY_FIX === "true"

  console.log("=== DIGITAL PRODUCT PRICE FIX REPORT ===")
  console.log(`Mode: ${applyFix ? "APPLY" : "DRY RUN"}`)

  const query = req.scope.resolve("query")
  const pricingModuleService = req.scope.resolve("pricing")

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "metadata", "variants.*", "variants.prices.*"],
    filters: { status: ["published", "draft"] }
  })

  let count = products.length

  const toFix: any[] = []

  for (const product of products) {
    if (!product.metadata?.is_digital) continue

    for (const variant of product.variants || []) {
      const v = variant as any
      if (!v.prices?.length) continue

      const cadPrice = v.prices.find((p: any) => p.currency_code === "cad" || p.currency_code === "CAD")
      if (!cadPrice) continue

      const currentAmount = cadPrice.amount
      
      // Look for unrealistic prices. e.g. over 100000 (which is $1,000.00 CAD) 
      // If it's a double multiplication, a $78 product is 780000 (which is $7,800 CAD)
      if (currentAmount > 200000) {
        let recommendedFix = currentAmount / 100
        
        console.log(`\nProduct ID: ${product.id}`)
        console.log(`Title: ${product.title}`)
        console.log(`Variant ID: ${variant.id}`)
        console.log(`Current CAD Amount: ${currentAmount} ($${(currentAmount/100).toFixed(2)})`)
        console.log(`Recommended Fix: ${recommendedFix} ($${(recommendedFix/100).toFixed(2)})`)

        toFix.push({
          priceId: cadPrice.id,
          amount: recommendedFix,
        })
      }
    }
  }

  console.log(`\nFound ${toFix.length} unrealistic prices.`)

  if (applyFix && toFix.length > 0) {
    const pricingModuleService = req.scope.resolve("pricing")
    for (const fix of toFix) {
      console.log(`[APPLY] Updating price ID ${fix.priceId} to amount ${fix.amount}`)
      // @ts-ignore - Some older V2 betas use updatePrices, others use updatePrices on price set
      await pricingModuleService.updatePrices([
        {
          id: fix.priceId,
          amount: fix.amount,
        }
      ])
    }
  }

  res.json({
    message: "Report complete",
    products_checked: count,
    issues_found: toFix.length,
    run_with_apply_fix: "?APPLY_FIX=true"
  })
}
