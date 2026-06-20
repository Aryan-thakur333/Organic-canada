import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

/**
 * Abandoned Cart Recovery Trigger
 *
 * Listens to `cart.updated` events. When a cart has been inactive for a
 * configurable threshold (default: 30 minutes), it emits a custom
 * `cart.abandoned` event so that downstream recovery workflows can fire.
 *
 * This is a logic placeholder — extend it with:
 * - Scheduled/cron job to batch-scan stale carts
 * - Email dispatch with promotional recovery codes
 * - Cart snapshotting for analytics
 */
export default async function abandonedCartTrigger({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const cartId = data.id
  const eventBus = container.resolve(Modules.EVENT_BUS) as any
  const query = container.resolve("query")

  try {
    // ── 1. Fetch cart with timestamps ────────────────────────────────────
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "email",
        "customer_id",
        "completed_at",
        "created_at",
        "updated_at",
        "items.id",
        "items.product_id",
        "items.title",
        "items.quantity",
      ],
      filters: { id: cartId },
    })

    const cart = carts?.[0]
    if (!cart) {
      return
    }

    // ── 2. Skip completed carts ──────────────────────────────────────────
    if (cart.completed_at) {
      return
    }

    // ── 3. Check abandonment threshold ──────────────────────────────────
    //    Carts updated more than ABANDONMENT_MINUTES ago are candidates.
    const ABANDONMENT_MINUTES = 30
    const updatedAt = new Date(cart.updated_at).getTime()
    const now = Date.now()
    const elapsedMinutes = (now - updatedAt) / 1000 / 60

    if (elapsedMinutes < ABANDONMENT_MINUTES) {
      // Cart is still within the active window
      return
    }

    // ── 4. Cart has no items — skip ─────────────────────────────────────
    if (!cart.items || cart.items.length === 0) {
      return
    }

    console.log(
      `[AbandonedCart] Cart ${cartId} abandoned after ${Math.round(elapsedMinutes)} min. ` +
      `Items: ${cart.items.length}, Email: ${cart.email || "guest"}`
    )

    // ── 5. Emit a custom `cart.abandoned` event for downstream workflows ──
    //     A dedicated recovery workflow can subscribe to this event to:
    //     - Send a promotional recovery code email
    //     - Trigger a notification to the store admin
    //     - Save the cart snapshot for retargeting
    await eventBus.emit({
      name: "cart.abandoned",
      data: {
        id: cartId,
        email: cart.email,
        customer_id: cart.customer_id,
        item_count: cart.items.length,
        elapsed_minutes: Math.round(elapsedMinutes),
        // Attach a dynamic promotional recovery code
        recovery_code: `RECOVER-${Date.now().toString(36).toUpperCase()}-${cartId.slice(-4).toUpperCase()}`,
      },
    })

    console.log(
      `[AbandonedCart] Emitted "cart.abandoned" event for cart ${cartId}`
    )
  } catch (error: any) {
    console.error(`[AbandonedCart] Failed to process cart ${cartId}:`, error)
  }
}

export const config: SubscriberConfig = {
  event: "cart.updated",
}
