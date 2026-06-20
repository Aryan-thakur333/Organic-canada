import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// ── Types ──────────────────────────────────────────────────────────────────

type InventoryItemUpdatedPayload = {
  id: string                         // inventory_item_id
  sku?: string
  stocked_quantity?: number
  reserved_quantity?: number
  location_id?: string
}

type PosWebhookPayload = {
  event: "inventory.synced"
  timestamp: string
  source: "medusa-storefront"
  inventory_item_id: string
  sku: string
  variant_id: string | null
  product_id: string | null
  product_title: string | null
  stocked_quantity: number
  reserved_quantity: number
  available_quantity: number
  location_id: string | null
}

// ── Subscriber ─────────────────────────────────────────────────────────────

/**
 * Subscribes to `inventory-item.updated` events from Medusa's internal event bus.
 *
 * Whenever online stock is altered (order placed, fulfillment processed,
 * admin adjustment), this subscriber:
 *
 *   1. Resolves the inventory item's variant and product metadata via query.graph
 *   2. Transforms the internal payload into a standardized POS webhook shape
 *   3. Issues an outbound Axios POST to the physical POS management API endpoint
 *
 * The POS terminal uses this payload to keep its local inventory ledger in sync
 * with the online storefront's stock movements.
 */
export default async function storefrontToPosSubscriber({
  event: { data },
  container,
}: SubscriberArgs<InventoryItemUpdatedPayload>) {
  const inventoryItemId = data.id
  const query = container.resolve("query") as any
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any

  // ── 1. Build POS webhook URL from env ──────────────────────────────────
  const posWebhookUrl = process.env.POS_INVENTORY_WEBHOOK_URL
  const posApiKey = process.env.POS_API_KEY

  if (!posWebhookUrl) {
    logger?.info?.("[Storefront→POS] POS_INVENTORY_WEBHOOK_URL not set — skipping outbound sync")
    return
  }

  // ── 1b. Dynamically import axios (avoids crash if package not installed) ──
  let axios: any
  try {
    axios = (await import("axios")).default || (await import("axios"))
  } catch {
    logger?.warn?.("[Storefront→POS] axios package not installed — install with `npm install axios` to enable outbound sync")
    return
  }

  try {
    // ── 2. Resolve inventory item → variant → product link graph ──────────
    const { data: inventoryItems } = await query.graph({
      entity: "inventory_item",
      fields: [
        "id",
        "sku",
        "variant.id",
        "variant.title",
        "variant.product.id",
        "variant.product.title",
        "variant.product.handle",
      ],
      filters: { id: inventoryItemId },
    })

    const inventoryItem = inventoryItems?.[0]
    if (!inventoryItem) {
      logger?.warn?.("[Storefront→POS] Inventory item not found:", inventoryItemId)
      return
    }

    // ── 3. Fetch current inventory levels for stock quantities ────────────
    const inventoryService: any = container.resolve(Modules.INVENTORY)
    const levels: Array<{ id: string; location_id: string; stocked_quantity: number; reserved_quantity: number }> =
      await inventoryService.listInventoryLevels(
        { inventory_item_id: inventoryItemId },
        { take: 100 }
      )

    // Aggregate stock across all locations
    let totalStocked = 0
    let totalReserved = 0
    let primaryLocationId: string | null = null

    for (const level of levels) {
      totalStocked += level.stocked_quantity ?? 0
      totalReserved += level.reserved_quantity ?? 0
      if (!primaryLocationId) primaryLocationId = level.location_id
    }

    const variant = inventoryItem.variant as {
      id: string
      title: string
      product: { id: string; title: string; handle: string }
    } | null

    // ── 4. Build standardized POS webhook payload ─────────────────────────
    const payload: PosWebhookPayload = {
      event: "inventory.synced",
      timestamp: new Date().toISOString(),
      source: "medusa-storefront",
      inventory_item_id: inventoryItemId,
      sku: inventoryItem.sku || variant?.title || "",
      variant_id: variant?.id || null,
      product_id: variant?.product?.id || null,
      product_title: variant?.product?.title || null,
      stocked_quantity: totalStocked,
      reserved_quantity: totalReserved,
      available_quantity: totalStocked - totalReserved,
      location_id: primaryLocationId,
    }

    // ── 5. Issue outbound Axios call ──────────────────────────────────────
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Source": "medusa-storefront",
    }
    if (posApiKey) {
      headers["Authorization"] = `Bearer ${posApiKey}`
    }

    const response = await axios.post(posWebhookUrl, payload, {
      headers,
      timeout: 10_000, // 10s timeout
    })

    logger?.info?.(
      `[Storefront→POS] Synced inventory item ${inventoryItemId} ` +
      `(sku: ${payload.sku}) → ${posWebhookUrl} ` +
      `[${response.status}]`
    )
  } catch (error: any) {
    // Log but never throw — subscriber failures must not crash the main flow
    if (axios.isAxiosError(error)) {
      logger?.error?.(
        `[Storefront→POS] Axios error syncing ${inventoryItemId} to ${posWebhookUrl}: ` +
        `${error.response?.status || error.code} — ${error.message}`
      )
    } else {
      logger?.error?.(
        `[Storefront→POS] Unexpected error syncing ${inventoryItemId}: ${error.message}`
      )
    }
  }
}

export const config: SubscriberConfig = {
  event: "inventory-item.updated",
}
