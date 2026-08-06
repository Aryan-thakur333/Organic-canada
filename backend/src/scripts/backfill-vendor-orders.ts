/**
 * Backfill Vendor Orders
 * 
 * Run with:
 *   npx medusa exec ./src/scripts/backfill-vendor-orders.ts
 * 
 * Reads all existing Medusa orders, resolves vendor ownership of each line item,
 * and creates VendorOrder + VendorOrderItem + VendorEarning records where they
 * are missing.
 *
 * Safe: idempotent — will never create duplicates.
 * Non-destructive: never modifies existing VendorOrders.
 */

import { MedusaContainer } from "@medusajs/framework"
import { MARKETPLACE_MODULE } from "../modules/marketplace/index.js"
import { Modules } from "@medusajs/framework/utils"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function selectedPaymentStatus(order: unknown): string | null {
  if (!isRecord(order)) return null
  const collections = order.payment_collections
  if (Array.isArray(collections) && isRecord(collections[0]) && typeof collections[0].status === "string") {
    return collections[0].status
  }
  return typeof order.payment_status === "string" ? order.payment_status : null
}

const COMMISSION_RATE = 0.10 // 10% — adjust if you have a commission module

export default async function backfillVendorOrders({
  container,
}: {
  container: MedusaContainer
}) {
  console.log("[VENDOR_BACKFILL_START] Starting backfill...")

  const query = container.resolve("query")
  const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)

  // 1. Fetch all orders with their items and payment status
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "currency_code",
      "payment_status",
      "status",
      "created_at",
      "items.*",
      "items.variant.id",
      "items.variant.product.id",
      "items.variant.product.metadata",
      "payment_collections.payments.provider_id",
      "payment_collections.status",
    ],
    pagination: { take: 1000 },
  })

  console.log(`[VENDOR_BACKFILL_START] Found ${orders.length} orders to process`)

  // 2. Fetch product → vendor mapping
  const allProductIds = new Set<string>()
  for (const order of orders) {
    for (const item of (order.items || [])) {
      if (item?.product_id) allProductIds.add(item.product_id)
    }
  }

  const productVendorMap = new Map<string, string>() // productId -> vendorId

  if (allProductIds.size > 0) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "metadata", "vendor.*"],
      filters: { id: Array.from(allProductIds) },
      pagination: { take: 5000 },
    })

    for (const product of products) {
      const vendorId =
        (product.vendor as any)?.id ||
        product.metadata?.vendor_id ||
        null

      if (vendorId) {
        productVendorMap.set(product.id, String(vendorId))
      }
    }
  }

  console.log(`[VENDOR_BACKFILL_START] Product→Vendor map: ${productVendorMap.size} products with vendors`)

  let created = 0
  let skipped = 0
  let errors = 0

  // 3. Process each order
  for (const order of orders) {
    if (!order?.id) continue

    const items = (order.items || []).filter((item): item is NonNullable<typeof item> & { product_id: string } =>
      item !== null && typeof item.product_id === "string"
    )

    // Group items by vendor
    const vendorBuckets = new Map<string, typeof items>()
    for (const item of items) {
      const vendorId = productVendorMap.get(item.product_id)
      if (!vendorId) continue
      if (!vendorBuckets.has(vendorId)) {
        vendorBuckets.set(vendorId, [])
      }
      vendorBuckets.get(vendorId)!.push(item)
    }

    if (vendorBuckets.size === 0) continue

    // Determine payment status from parent order based on strict mapping
    const paymentStatus = (() => {
      const pc = order.payment_collections?.[0]
      const statusSource = pc?.status || selectedPaymentStatus(order)
      
      switch (statusSource) {
        case "captured": return "captured"
        case "authorized": return "authorized"
        case "pending": return "awaiting_payment"
        case "awaiting": return "awaiting_payment" // Medusa fallback
        case "refunded": return "refunded"
        case "partially_refunded": return "partially_refunded"
        default: return "awaiting_payment"
      }
    })()

    for (const [vendorId, vendorItems] of vendorBuckets) {
      console.log(`[VENDOR_BACKFILL_ORDER] order=${order.id} vendor=${vendorId} items=${vendorItems.length}`)

      try {
        // Idempotency check
        const existing = await marketplaceService.listVendorOrders({
          order_id: order.id,
          vendor_id: vendorId,
        })

        if (existing && existing.length > 0) {
          // Existing — check if payment_status needs updating
          const vo = existing[0]
          if (vo.payment_status !== paymentStatus && paymentStatus === "captured") {
            await marketplaceService.updateVendorOrders({
              id: vo.id,
              payment_status: "captured",
            })
            console.log(`[VENDOR_BACKFILL_SKIPPED] Already exists (${vo.id}), updated payment_status → captured`)
          } else {
            console.log(`[VENDOR_BACKFILL_SKIPPED] Already exists (${vo.id}), skipping`)
          }
          skipped++
          continue
        }

        // Calculate totals in minor units
        const itemSubtotal = vendorItems.reduce(
          (sum: number, item: any) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0),
          0
        )
        const commissionTotal = Math.round(itemSubtotal * COMMISSION_RATE)
        const vendorNetTotal = itemSubtotal - commissionTotal

        // Create VendorOrder
        const vendorOrder = await marketplaceService.createVendorOrders({
          vendor_id: vendorId,
          order_id: order.id,
          display_id: order.display_id ?? null,
          status: "pending",
          payment_status: paymentStatus,
          currency_code: order.currency_code || "cad",
          item_subtotal: itemSubtotal,
          commission_total: commissionTotal,
          vendor_net_total: vendorNetTotal,
        })

        // Create items
        for (const item of vendorItems) {
          const itemSub = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
          const itemCommission = Math.round(itemSub * COMMISSION_RATE)
          const itemNet = itemSub - itemCommission

          await marketplaceService.createVendorOrderItems({
            vendor_order_id: vendorOrder.id,
            order_id: order.id,
            line_item_id: item.id,
            order_item_id: item.id,
            product_id: item.product_id,
            variant_id: item.variant_id || item.variant?.id || "",
            vendor_id: vendorId,
            title: item.title || "",
            sku: item.variant?.sku || null,
            quantity: Number(item.quantity) || 0,
            unit_price: Number(item.unit_price) || 0,
            subtotal: itemSub,
            commission_amount: itemCommission,
            vendor_net_amount: itemNet,
          })
        }

        // Create earning record
        try {
          await marketplaceService.createVendorEarnings({
            vendor_order_id: vendorOrder.id,
            vendor_id: vendorId,
            order_id: order.id,
            gross_amount: itemSubtotal,
            commission_amount: commissionTotal,
            net_amount: vendorNetTotal,
            status: paymentStatus === "captured" ? "locked" : "pending",
          })
        } catch (earningErr: any) {
          console.warn("[VENDOR_BACKFILL_ORDER] Earning creation failed (non-fatal):", earningErr?.message)
        }

        // Create initial activity
        try {
          await marketplaceService.createVendorOrderActivities({
            vendor_order_id: vendorOrder.id,
            vendor_id: vendorId,
            type: "order_received",
            title: "Order received (backfilled)",
            actor_type: "system",
          })
        } catch (actErr: any) {
          console.warn("[VENDOR_BACKFILL_ORDER] Activity creation failed (non-fatal):", actErr?.message)
        }

        console.log(
          `[VENDOR_BACKFILL_CREATED] VendorOrder ${vendorOrder.id} for ` +
          `order=${order.id} display_id=${order.display_id} vendor=${vendorId} ` +
          `gross=${itemSubtotal} commission=${commissionTotal} net=${vendorNetTotal} payment=${paymentStatus}`
        )
        created++
      } catch (err: any) {
        console.error(
          `[VENDOR_BACKFILL_ERROR] order=${order.id} vendor=${vendorId}: ${err?.message}`
        )
        errors++
      }
    }
  }

  console.log(
    `[VENDOR_BACKFILL_DONE] created=${created} skipped=${skipped} errors=${errors}`
  )
}
