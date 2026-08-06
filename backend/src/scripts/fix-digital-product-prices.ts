import { ExecArgs } from "@medusajs/framework/types"
import { ProductStatus } from "@medusajs/framework/utils"

export default async function fixDigitalProductPrices({ container }: ExecArgs) {
  const productService = container.resolve("product")
  
  // We determine if we are applying the fix via env var or arg
  const applyFix = process.argv.includes("--apply") || process.env.APPLY_FIX === "true"

  console.log("=== DIGITAL PRODUCT PRICE FIX REPORT ===")
  console.log(`Mode: ${applyFix ? "APPLY" : "DRY RUN"}`)

  const query = container.resolve("query")
  const pricingModuleService = container.resolve("pricing")

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
      
      // Look for unrealistic prices. e.g. over 200000 (which is $2,000.00 CAD for a digital download typically) 
      // If it's a double multiplication, a $78 product is 780000 (which is $7,800 CAD)
      if (currentAmount > 200000) {
        let recommendedFix = currentAmount / 100
        
        console.log(`\nProduct ID: ${product.id}`)
        console.log(`Title: ${product.title}`)
        console.log(`Variant ID: ${variant.id}`)
        console.log(`Current CAD Amount: ${currentAmount} ($${(currentAmount/100).toFixed(2)})`)
        console.log(`Recommended Fix: ${recommendedFix} ($${(recommendedFix/100).toFixed(2)})`)

        toFix.push({
          priceSetId: cadPrice.price_set_id,
          priceId: cadPrice.id,
          currencyCode: cadPrice.currency_code,
          amount: recommendedFix,
        })
      }
    }
  }

  console.log(`\nFound ${toFix.length} unrealistic prices.`)

  if (applyFix && toFix.length > 0) {
    const pricingModuleService = container.resolve("pricing")
    for (const fix of toFix) {
      console.log(`[APPLY] Updating price ID ${fix.priceId} to amount ${fix.amount}`)
      if (!fix.priceSetId) {
        throw new Error(`Cannot update price ${fix.priceId}: missing price_set_id`)
      }
      await pricingModuleService.updatePriceSets(fix.priceSetId, {
        prices: [
          {
            id: fix.priceId,
            currency_code: fix.currencyCode,
            amount: fix.amount,
          },
        ],
      })
    }
    console.log("Prices successfully repaired.")
  } else if (!applyFix && toFix.length > 0) {
    console.log("\nTo apply these fixes, run this script with --apply:")
    console.log("npx medusa exec ./src/scripts/fix-digital-product-prices.ts --apply")
  }
}
