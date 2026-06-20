import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../../modules/bundle"

// ── Types ──────────────────────────────────────────────────────────────────

export type DeductBundleInventoryStepInput = {
  order_id: string
  items: Array<{
    id: string
    product_id: string
    variant_id: string
    title: string
    quantity: number
    unit_price: number
    metadata?: Record<string, unknown> | null
  }>
}

export type InventoryDeduction = {
  level_id: string
  inventory_item_id: string
  location_id: string
  variant_id: string
  product_id: string
  line_item_id: string
  bundle_parent_product_id: string
  child_quantity: number
  deduction_amount: number
}

export type InventoryDeductionGroup = {
  bundle_parent_product_id: string
  deductions: InventoryDeduction[]
}

export type DeductBundleInventoryStepOutput = {
  bundle_groups: InventoryDeductionGroup[]
  total_deductions: number
}

// ── Step ───────────────────────────────────────────────────────────────────

export const deductBundleInventoryStep = (createStep as any)(
  "deduct-bundle-inventory",

  async ({ items }: DeductBundleInventoryStepInput, { container }: any) => {
    const bundleService: any = container.resolve(BUNDLE_MODULE)
    const inventoryService: any = container.resolve(Modules.INVENTORY)
    const query: any = container.resolve("query")

    const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))]
    if (productIds.length === 0) {
      return new StepResponse({ bundle_groups: [], total_deductions: 0 })
    }

    const bundleItems: any[] = await bundleService.listBundleItems({ parent_product_id: productIds })
    if (bundleItems.length === 0) {
      return new StepResponse({ bundle_groups: [], total_deductions: 0 })
    }

    const bundleMap = new Map<string, any[]>()
    for (const bi of bundleItems) {
      const existing = bundleMap.get(bi.parent_product_id) || []
      existing.push(bi)
      bundleMap.set(bi.parent_product_id, existing)
    }

    const allDeductions: InventoryDeduction[] = []
    const oosErrors: string[] = []

    for (const [parentProductId, children] of bundleMap) {
      const lineItem = items.find(i => i.product_id === parentProductId)
      if (!lineItem) {
        console.warn(`[DeductBundleInventory] Bundle parent ${parentProductId} not found in order line items`)
        continue
      }

      if (children.length > 5) {
        oosErrors.push(`Bundle ${parentProductId} has ${children.length} children (max 5 allowed)`)
        continue
      }

      for (const child of children) {
        const childQty = child.quantity * lineItem.quantity

        const { data: childProducts } = await query.graph({
          entity: "product",
          fields: ["id", "variants.id", "variants.inventory_items.inventory_item_id", "variants.inventory_items.required_quantity"],
          filters: { id: child.child_product_id },
        })

        const product: any = childProducts?.[0]
        if (!product) { oosErrors.push(`Child product ${child.child_product_id} not found`); continue }

        const variants: any[] = product.variants || []
        if (variants.length === 0) { oosErrors.push(`Child product ${child.child_product_id} has no variants`); continue }

        const invItems: any[] = variants[0].inventory_items || []
        if (invItems.length === 0) { oosErrors.push(`Child variant ${variants[0].id} has no inventory`); continue }

        for (const inv of invItems) {
          const deductionQty = (inv.required_quantity || 1) * childQty
          const levels: any[] = await inventoryService.listInventoryLevels(
            { inventory_item_id: inv.inventory_item_id },
            { take: 100 }
          )

          if (levels.length === 0) { oosErrors.push(`No inventory levels for item ${inv.inventory_item_id}`); continue }

          const totalAvail = levels.reduce((s: number, l: any) => s + (l.stocked_quantity || 0), 0)
          if (totalAvail < deductionQty) {
            oosErrors.push(`Insufficient stock for child ${child.child_product_id}: need ${deductionQty}, have ${totalAvail}`)
            continue
          }

          let remaining = deductionQty
          for (const level of levels) {
            if (remaining <= 0) break
            const deduct = Math.min(remaining, level.stocked_quantity || 0)
            if (deduct <= 0) continue

            await inventoryService.adjustInventory(level.id, {
              inventory_item_id: inv.inventory_item_id,
              location_id: level.location_id,
              adjustment: -deduct,
            })

            allDeductions.push({
              level_id: level.id,
              inventory_item_id: inv.inventory_item_id,
              location_id: level.location_id,
              variant_id: variants[0].id,
              product_id: child.child_product_id,
              line_item_id: lineItem.id,
              bundle_parent_product_id: parentProductId,
              child_quantity: childQty,
              deduction_amount: deduct,
            })

            remaining -= deduct
          }
        }
      }
    }

    if (oosErrors.length > 0) {
      for (const err of oosErrors) console.error(`[DeductBundleInventory] OOS: ${err}`)
      throw new Error(`Bundle inventory deduction failed: ${oosErrors.length} child item(s) out of stock. All changes rolled back.`)
    }

    const groups: InventoryDeductionGroup[] = []
    for (const ded of allDeductions) {
      let g = groups.find(x => x.bundle_parent_product_id === ded.bundle_parent_product_id)
      if (!g) { g = { bundle_parent_product_id: ded.bundle_parent_product_id, deductions: [] }; groups.push(g) }
      g.deductions.push(ded)
    }

    return new StepResponse(
      { bundle_groups: groups, total_deductions: allDeductions.length } as any,
      allDeductions
    )
  },

  async (deductions: InventoryDeduction[], { container }: any) => {
    if (!deductions || deductions.length === 0) return
    const inventoryService: any = container.resolve(Modules.INVENTORY)
    for (const ded of deductions) {
      try {
        await inventoryService.adjustInventory(ded.level_id, {
          inventory_item_id: ded.inventory_item_id,
          location_id: ded.location_id,
          adjustment: ded.deduction_amount,
        })
      } catch (err: any) {
        console.error(`[DeductBundleInventory][Comp] Failed to reverse level ${ded.level_id}: ${err.message}`)
      }
    }
  }
)
