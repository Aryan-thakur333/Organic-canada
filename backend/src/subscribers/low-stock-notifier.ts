import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { sendVendorNotificationWorkflow } from "../workflows/send-vendor-notification"

/**
 * Low Stock Notifier Subscriber
 *
 * Listens to `inventory-level.updated` events. When a product variant's
 * stock level drops below the threshold (5 units), it resolves the linked
 * vendor via the product→vendor link graph and dispatches a low-stock alert.
 *
 * The actual notification is dispatched through the reusable
 * `sendVendorNotificationWorkflow` so it can be re-used by any background task.
 */
export default async function lowStockNotifier({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; stocked_quantity?: number }>) {
  const inventoryLevelId = data.id
  const query = container.resolve("query")

  try {
    // ── 1. Fetch the inventory level with variant + product info ──────────
    const { data: inventoryLevels } = await query.graph({
      entity: "inventory_level",
      fields: [
        "id",
        "stocked_quantity",
        "inventory_item.id",
        "inventory_item.variant.id",
        "inventory_item.variant.title",
        "inventory_item.variant.product.id",
        "inventory_item.variant.product.title",
        "inventory_item.variant.product.handle",
      ],
      filters: { id: inventoryLevelId },
    })

    const level = inventoryLevels?.[0]
    if (!level) {
      console.warn(`[LowStock] Inventory level ${inventoryLevelId} not found`)
      return
    }

    const stockedQty = level.stocked_quantity ?? 0
    const variantTitle = level.inventory_item?.variant?.title ?? "Unknown Variant"
    const productId = level.inventory_item?.variant?.product?.id
    const productTitle = level.inventory_item?.variant?.product?.title ?? "Unknown Product"

    // ── 2. Check threshold ───────────────────────────────────────────────
    const THRESHOLD = 5
    if (stockedQty >= THRESHOLD) {
      // Stock is sufficient — no alert needed
      return
    }

    console.log(
      `[LowStock] Alert triggered: "${productTitle} - ${variantTitle}" ` +
      `(stock: ${stockedQty}, threshold: ${THRESHOLD})`
    )

    // ── 3. Resolve the vendor linked to this product ─────────────────────
    if (!productId) {
      console.warn(`[LowStock] No product found for inventory level ${inventoryLevelId}`)
      return
    }

    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "vendor.id", "vendor.store_name", "vendor.email"],
      filters: { id: productId },
    })

    const product = products?.[0]
    const vendor = product?.vendor as { id: string; store_name?: string; email?: string } | null

    if (!vendor?.id) {
      console.log(
        `[LowStock] Product "${productTitle}" has no linked vendor. ` +
        `Skipping vendor notification.`
      )
      return
    }

    // ── 4. Dispatch low-stock notification via the shared workflow ────────
    const { result } = await sendVendorNotificationWorkflow(container).run({
      input: {
        vendor_id: vendor.id,
        subject: `Low Stock Alert: ${productTitle}`,
        message:
          `Your product "${productTitle} (${variantTitle})" is running low on stock. ` +
          `Current inventory: ${stockedQty} units. ` +
          `Please restock soon to avoid order delays.`,
        priority: "high",
        channel: "email",
        metadata: {
          inventory_level_id: inventoryLevelId,
          product_id: productId,
          variant_title: variantTitle,
          stocked_quantity: stockedQty,
          threshold: THRESHOLD,
        },
      },
    })

    console.log(
      `[LowStock] Notification sent to vendor "${vendor.store_name || vendor.id}": ` +
      `"${result.subject}"`
    )
  } catch (error: any) {
    console.error(`[LowStock] Failed to process inventory level ${inventoryLevelId}:`, error)
  }
}

export const config: SubscriberConfig = {
  event: "inventory-level.updated",
}
