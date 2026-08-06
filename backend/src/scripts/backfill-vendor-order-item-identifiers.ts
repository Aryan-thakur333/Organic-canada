import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace/index.js"
import { resolveVendorOrderItemInventory } from "../utils/marketplace/resolve-vendor-order-item-inventory.js"

export default async function backfillVendorOrderItemIdentifiers({
  container,
}: ExecArgs) {
  console.log("[VENDOR_ITEM_IDENTIFIER_BACKFILL_START]")

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)

  try {
    const { data: items } = await query.graph({
      entity: "vendor_order_item",
      fields: [
        "id",
        "line_item_id",
        "variant_id",
        "product_id",
        "sku",
        "title",
        "vendor_order.id",
        "vendor_order.order_id"
      ],
      filters: {}
    })

    if (!items || items.length === 0) {
      console.log("[VENDOR_ITEM_IDENTIFIER_BACKFILL_DONE]", { count: 0 })
      return
    }

    for (const item of items) {
      const parentOrderId = item.vendor_order?.order_id
      if (!parentOrderId) {
        console.log("[VENDOR_ITEM_IDENTIFIER_SKIPPED]", {
          id: item.id,
          reason: "no parent order_id on vendor_order"
        })
        continue
      }

      if (item.variant_id) {
        console.log("[VENDOR_ITEM_IDENTIFIER_SKIPPED]", {
          id: item.id,
          reason: "already has variant_id"
        })
        continue
      }

      try {
        const resolved = await resolveVendorOrderItemInventory({
          container,
          vendorOrderItem: item,
          parentOrderId
        })

        await marketplaceService.updateVendorOrderItems({
          id: item.id,
          variant_id: resolved.variantId,
          product_id: resolved.productId,
          sku: item.sku || resolved.sku || "",
          title: item.title || resolved.title || ""
        })

        console.log("[VENDOR_ITEM_IDENTIFIER_BACKFILLED]", {
          vendorOrderItemId: item.id,
          variantId: resolved.variantId,
          productId: resolved.productId
        })

      } catch (err: any) {
        console.error(`Failed backfilling item ${item.id}:`, err.message)
      }
    }

    console.log("[VENDOR_ITEM_IDENTIFIER_BACKFILL_DONE]")
  } catch (error: any) {
    console.error("Backfill script failed:", error)
    throw error
  }
}
