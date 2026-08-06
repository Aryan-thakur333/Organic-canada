/**
 * audit-db-integrity.ts
 *
 * READ-ONLY database integrity audit script. Queries Medusa entities
 * to detect schema or data inconsistencies.
 *
 * Usage:
 *   npx medusa exec src/scripts/audit-db-integrity.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function auditDbIntegrity({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  console.log("╔══════════════════════════════════════════════════════════╗")
  console.log("║             DATABASE INTEGRITY AUDIT (READ ONLY)         ║")
  console.log("╚══════════════════════════════════════════════════════════╝")
  console.log("")

  // 1. Fetch products & variants
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "handle", "status",
      "sales_channels.id", "sales_channels.name",
      "variants.id", "variants.title", "variants.sku", "variants.manage_inventory",
      "variants.prices.id", "variants.prices.amount", "variants.prices.currency_code",
      "variants.inventory_items.inventory_item_id"
    ],
    pagination: { take: 10000 }
  })

  let duplicateSkuCount = 0
  let duplicatePriceCount = 0
  let missingPriceCount = 0
  let missingChannelCount = 0
  let missingInventoryCount = 0
  let totalVariants = 0

  const skuMap = new Map<string, string[]>()
  
  for (const p of products || []) {
    const channels = p.sales_channels || []
    if (channels.length === 0 && p.status === "published") {
      missingChannelCount++
      console.warn(`[WARNING] Product "${p.title}" (${p.id}) is published but has NO sales channels.`)
    }

    for (const v of p.variants || []) {
      totalVariants++
      
      // SKU checks
      if (v.sku) {
        const existing = skuMap.get(v.sku) || []
        existing.push(`${p.title} (${v.id})`)
        skuMap.set(v.sku, existing)
      } else {
        console.warn(`[WARNING] Variant "${v.title}" of "${p.title}" has NO SKU.`)
      }

      // Price checks
      const prices = v.prices || []
      if (prices.length === 0) {
        missingPriceCount++
        console.warn(`[WARNING] Variant "${v.title}" of "${p.title}" (${v.id}) has NO prices.`)
      } else {
        const currencyCodes = new Set<string>()
        for (const pr of prices) {
          const cur = String(pr.currency_code).toLowerCase()
          if (currencyCodes.has(cur)) {
            duplicatePriceCount++
            console.error(`[ERROR] Variant "${v.title}" (${v.id}) has DUPLICATE prices for currency: ${cur.toUpperCase()}`)
          }
          currencyCodes.add(cur)
        }
      }

      // Inventory check
      if (v.manage_inventory) {
        const invItems = v.inventory_items || []
        if (invItems.length === 0) {
          missingInventoryCount++
          console.warn(`[WARNING] Variant "${v.title}" of "${p.title}" (${v.id}) has manage_inventory=true but NO inventory items.`)
        }
      }
    }
  }

  // Report duplicate SKUs
  for (const [sku, entries] of skuMap.entries()) {
    if (entries.length > 1) {
      duplicateSkuCount++
      console.error(`[ERROR] Duplicate SKU "${sku}" found on ${entries.length} variants:`, entries)
    }
  }

  // 2. Fetch POS Operator Assignments
  let brokenPosAssignments = 0
  try {
    const { data: assignments } = await query.graph({
      entity: "pos_operator_assignment",
      fields: ["id", "operator_id", "register_id"],
      pagination: { take: 10000 }
    })
    
    for (const a of assignments || []) {
      if (!a.operator_id || !a.register_id) {
        brokenPosAssignments++
        console.error(`[ERROR] Broken POS assignment: ID ${a.id} has missing operator_id or register_id.`)
      }
    }
  } catch (err: any) {
    // POS module might not be fully loaded or setup in all contexts
    console.log(`[INFO] POS assignment query status: ${err?.message || err}`)
  }

  console.log("")
  console.log("╔════════════════════════════════╗")
  console.log("║        INTEGRITY SUMMARY       ║")
  console.log("╠════════════════════════════════╣")
  console.log(`║ Total Variants Checked : ${String(totalVariants).padEnd(5)} ║`)
  console.log(`║ Duplicate SKUs         : ${String(duplicateSkuCount).padEnd(5)} ║`)
  console.log(`║ Duplicate Price Records: ${String(duplicatePriceCount).padEnd(5)} ║`)
  console.log(`║ Missing Price Records  : ${String(missingPriceCount).padEnd(5)} ║`)
  console.log(`║ Missing Sales Channels : ${String(missingChannelCount).padEnd(5)} ║`)
  console.log(`║ Missing Inventory Items: ${String(missingInventoryCount).padEnd(5)} ║`)
  console.log(`║ Broken POS Assignments : ${String(brokenPosAssignments).padEnd(5)} ║`)
  console.log("╚════════════════════════════════╝")
  console.log("")
}
