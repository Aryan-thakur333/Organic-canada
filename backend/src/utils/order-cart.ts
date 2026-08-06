import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle"

export type CartOrderLookup = {
  order: { id: string; display_id?: number; status?: string } | null
  lookupSource: "order_cart_link"
}

export class OrderCartLookupError extends Error {
  code = "ORDER_CART_LOOKUP_FAILED"
  status = 500

  constructor(cause?: unknown) {
    super("Unable to verify the cart's order status.")
    this.name = "OrderCartLookupError"
    if (cause) (this as any).cause = cause
  }
}

/**
 * The Medusa v2 order/cart association is a remote module link exposed to the
 * Query Graph as `order_cart`. `Order` itself intentionally has no cart_id.
 */
export async function findOrderForCart({ query, cartId }: { query: any; cartId: string }): Promise<CartOrderLookup> {
  try {
    const { data: links } = await query.graph({
      entity: "order_cart",
      fields: ["cart_id", "order_id"],
      filters: { cart_id: cartId },
      pagination: { take: 1 },
    })
    const link = Array.isArray(links) ? links[0] : links
    if (!link?.order_id) return { order: null, lookupSource: "order_cart_link" }

    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "status"],
      filters: { id: link.order_id },
      pagination: { take: 1 },
    })
    const order = Array.isArray(orders) ? orders[0] : orders
    if (!order?.id) throw new Error("Cart order link points to an unavailable order")

    return { order, lookupSource: "order_cart_link" }
  } catch (error) {
    if (error instanceof OrderCartLookupError) throw error
    throw new OrderCartLookupError(error)
  }
}

/**
 * Converts active cart snapshots after Medusa has created the order. It is
 * safe to call after a dropped response: already-converted snapshots for the
 * same order are left unchanged, and no cart/payment work is repeated.
 */
export async function convertCartBundleSnapshotsToOrder({
  scope,
  query,
  cartId,
  orderId,
}: {
  scope: any
  query: any
  cartId: string
  orderId: string
}) {
  const bundleService: any = scope.resolve(BUNDLE_MODULE)
  let snapshots: any[]
  let order: any

  try {
    snapshots = await bundleService.listBundleLineSnapshots({ cart_id: cartId })
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "items.id", "items.metadata"],
      filters: { id: orderId },
      pagination: { take: 1 },
    })
    order = Array.isArray(orders) ? orders[0] : orders
  } catch (cause) {
    const error: any = new Error("Unable to convert the bundle cart snapshot to the order.")
    error.code = "BUNDLE_SNAPSHOT_CONVERSION_FAILED"
    error.status = 500
    error.cause = cause
    throw error
  }

  if (!order?.id) {
    const error: any = new Error("Unable to load the completed order for bundle snapshot conversion.")
    error.code = "BUNDLE_SNAPSHOT_CONVERSION_FAILED"
    error.status = 500
    throw error
  }

  for (const snapshot of snapshots || []) {
    if (snapshot.status === "voided") continue
    if (snapshot.status === "converted") {
      if (snapshot.order_id && snapshot.order_id !== orderId) {
        const error: any = new Error("Bundle snapshot is already linked to a different order.")
        error.code = "BUNDLE_SNAPSHOT_CONVERSION_FAILED"
        error.status = 500
        throw error
      }
      continue
    }

    const matchingLine = (order.items || []).find(
      (item: any) => item.metadata?.bundle_group_id === snapshot.bundle_group_id
    )
    if (!matchingLine?.id) {
      const error: any = new Error("Completed order is missing a bundle component line required by its snapshot.")
      error.code = "BUNDLE_SNAPSHOT_CONVERSION_FAILED"
      error.status = 500
      throw error
    }

    await bundleService.updateBundleLineSnapshots({
      id: snapshot.id,
      status: "converted",
      order_id: orderId,
      order_line_item_id: matchingLine.id,
      reservation_status: snapshot.reservation_status === "reserved" ? "committed" : snapshot.reservation_status,
    })
  }
}
