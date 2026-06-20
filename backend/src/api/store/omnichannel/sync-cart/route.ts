import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

// ── Types ──────────────────────────────────────────────────────────────────

type SyncCartMobileItem = {
  variant_id: string
  quantity: number
  /** Optional client-side timestamp for conflict resolution */
  updated_at?: string
}

type SyncCartRequestBody = {
  /** Items from the mobile/offline device */
  mobile_items: SyncCartMobileItem[]
  /** Active web session cart ID (optional — resolved via customer if absent) */
  web_cart_id?: string
  /** Device identifier for offline terminal session tracking */
  device_id?: string
  /** Sales channel override for the unified cart */
  sales_channel_id?: string
}

// ── Merge helpers ──────────────────────────────────────────────────────────

/**
 * Merges two item arrays keyed by variant_id.
 * Same variant → quantities are summed (taking the max of the two if
 * conflict, preferring the mobile value for timestamps).
 * Unique items from each source are preserved.
 */
function mergeItemsByVariant(
  webItems: Array<{ variant_id: string; quantity: number }>,
  mobileItems: SyncCartMobileItem[]
): Array<{ variant_id: string; quantity: number }> {
  const merged = new Map<string, number>()

  // Seed with web items
  for (const item of webItems) {
    const existing = merged.get(item.variant_id) ?? 0
    merged.set(item.variant_id, existing + item.quantity)
  }

  // Merge mobile items on top (sum quantities for same variant)
  for (const item of mobileItems) {
    const existing = merged.get(item.variant_id) ?? 0
    merged.set(item.variant_id, existing + item.quantity)
  }

  return Array.from(merged.entries())
    .filter(([_, qty]) => qty > 0)
    .map(([variant_id, quantity]) => ({ variant_id, quantity }))
}

/**
 * Reconciles prices for a set of merged items against current variant prices.
 * Returns enriched items with title, unit_price, product_id, and thumbnail.
 */
async function enrichItemsWithPrices(
  items: Array<{ variant_id: string; quantity: number }>,
  query: any,
  currency_code: string
): Promise<{
  line_items: Array<{
    title: string
    quantity: number
    unit_price: number
    variant_id: string
    product_id: string
    thumbnail?: string
  }>
  total: number
}> {
  const variantIds = items.map((i) => i.variant_id)

  const { data: variants } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "title",
      "sku",
      "product.id",
      "product.title",
      "product.thumbnail",
      "prices.id",
      "prices.amount",
      "prices.currency_code",
    ],
    filters: { id: variantIds },
  })

  const lineItems: any[] = []
  let total = 0

  for (const item of items) {
    const variant = variants?.find((v: any) => v.id === item.variant_id)
    if (!variant) {
      console.warn(`[Omnichannel Sync] Variant ${item.variant_id} not found — skipping`)
      continue
    }

    // Find best price for the requested currency
    const prices = variant.prices || []
    const price =
      prices.find((p: any) => p.currency_code === currency_code) || prices[0]

    const unitPrice = price?.amount ?? 0
    const subtotal = unitPrice * item.quantity
    total += subtotal

    lineItems.push({
      title: variant.product?.title || variant.title || "Synced Item",
      quantity: item.quantity,
      unit_price: unitPrice,
      variant_id: variant.id,
      product_id: variant.product?.id,
      thumbnail: variant.product?.thumbnail || null,
    })

    console.log(
      `[Omnichannel Sync] Reconciled: ${variant.product?.title || variant.title} × ${item.quantity} @ ${unitPrice}${currency_code}`
    )
  }

  return { line_items: lineItems, total }
}

// ── POST ───────────────────────────────────────────────────────────────────

/**
 * Omnichannel Cart Synchronization
 *
 * Merges a mobile/offline cart session with an active web cart into a single
 * unified cart. Designed to handle the scenario where a customer adds items
 * on their mobile device while having an active checkout session on the web.
 *
 * Reconciliation rules:
 * - Same variant in both sources → quantities are summed
 * - Unique items from either source → preserved
 * - Prices are re-resolved from the latest variant price list
 * - The "winning" cart is updated in-place; the old cart is left as a snapshot
 *
 * Request:
 * ```json
 * {
 *   "mobile_items": [{ "variant_id": "variant_01J...", "quantity": 2 }],
 *   "web_cart_id": "cart_01J...",
 *   "device_id": "device_abc123"
 * }
 * ```
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = req.body as SyncCartRequestBody
  const { mobile_items, web_cart_id, device_id } = body

  // ── Validate input ──────────────────────────────────────────────────
  if (!mobile_items?.length && !web_cart_id) {
    return res.status(400).json({
      message: "Provide at least mobile_items or a web_cart_id to synchronize",
    })
  }

  // ── Resolve services ────────────────────────────────────────────────
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const cartService: any = req.scope.resolve(Modules.CART)
  const remoteLink: any = req.scope.resolve(ContainerRegistrationKeys.REMOTE_LINK)

  const customerId = (req as any).auth_context?.actor_id as string | undefined

  try {
    // ── Step 1: Identify the web cart ──────────────────────────────────
    let targetCartId = web_cart_id

    // If no explicit web_cart_id but customer is authenticated, find their
    // most recent active (non-completed) cart
    if (!targetCartId && customerId) {
      const { data: customerCarts } = await query.graph({
        entity: "cart",
        fields: ["id", "email", "currency_code", "completed_at", "created_at"],
        filters: {
          customer_id: customerId,
          completed_at: null,
        },
      })

      const sortedCarts = (customerCarts || []).sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      targetCartId = sortedCarts?.[0]?.id
    }

    // ── Step 2: Retrieve the existing web cart (if any) ────────────────
    let existingCart: any = null
    let existingItems: Array<{ variant_id: string; quantity: number }> = []

    if (targetCartId) {
      try {
        existingCart = await cartService.retrieveCart(targetCartId, {
          select: [
            "id",
            "email",
            "currency_code",
            "region_id",
            "customer_id",
            "sales_channel_id",
          ],
          relations: ["items"],
        })

        existingItems = (existingCart?.items || []).map((item: any) => ({
          variant_id: item.variant_id || item.id,
          quantity: item.quantity,
        }))

        console.log(
          `[Omnichannel Sync] Found web cart ${targetCartId} with ${existingItems.length} item(s)`
        )
      } catch (err: any) {
        console.warn(
          `[Omnichannel Sync] Web cart ${targetCartId} not found:`,
          err.message
        )
        existingCart = null
      }
    }

    // ── Step 3: Merge line items ──────────────────────────────────────-
    const mergedItems = mergeItemsByVariant(existingItems, mobile_items || [])

    if (mergedItems.length === 0) {
      return res.json({
        synchronized: true,
        cart_id: targetCartId || null,
        message: "Cart is empty after merge",
        items: [],
        total: 0,
      })
    }

    console.log(
      `[Omnichannel Sync] Merged ${existingItems.length} web + ${(mobile_items || []).length} mobile = ${mergedItems.length} unique variant(s)`
    )

    // ── Step 4: Resolve region & currency ─────────────────────────────
    const currency_code = existingCart?.currency_code || "eur"
    let regionId = existingCart?.region_id
    let salesChannelId = existingCart?.sales_channel_id || body.sales_channel_id

    if (!regionId) {
      const { data: regions } = await query.graph({
        entity: "region",
        fields: ["id", "currency_code"],
        filters: { currency_code },
        pagination: { take: 1 },
      })
      regionId = regions?.[0]?.id
    }

    if (!salesChannelId) {
      const salesChannelService: any = req.scope.resolve(Modules.SALES_CHANNEL)
      const channels = await salesChannelService.listSalesChannels(
        { name: "Default Sales Channel" },
        { take: 1 }
      )
      salesChannelId = channels?.[0]?.id
    }

    // ── Step 5: Reconcile prices ──────────────────────────────────────
    const { line_items, total } = await enrichItemsWithPrices(
      mergedItems,
      query,
      currency_code
    )

    // ── Step 6: Create or update the unified cart ─────────────────────
    let unifiedCart: any

    if (existingCart) {
      // Update existing cart in-place:
      // 1. For items already in the cart → update quantity
      // 2. For new items → add as line items
      const existingByVariant = new Map<string, { id: string; quantity: number }>(
        (existingCart.items || []).map((i: any) => [
          i.variant_id || i.id,
          { id: i.id, quantity: i.quantity },
        ])
      )

      const itemsToAdd: any[] = []
      const itemsToUpdate: any[] = []

      for (const item of line_items) {
        const existing = existingByVariant.get(item.variant_id)
        if (existing) {
          itemsToUpdate.push({
            id: existing.id,
            quantity: item.quantity,
          })
        } else {
          itemsToAdd.push({
            variant_id: item.variant_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            title: item.title,
            product_id: item.product_id,
            metadata: {
              omnichannel_synced: true,
              synced_at: new Date().toISOString(),
              device_id: device_id || null,
            },
          })
        }
      }

      // Apply updates
      if (itemsToUpdate.length > 0) {
        await cartService.updateLineItems(itemsToUpdate)
      }
      if (itemsToAdd.length > 0) {
        await cartService.addLineItems(targetCartId!, itemsToAdd)
      }

      // Re-fetch the updated cart for the response
      unifiedCart = await cartService.retrieveCart(targetCartId!)

      console.log(
        `[Omnichannel Sync] Updated existing cart ${targetCartId}: ` +
        `${itemsToUpdate.length} updated, ${itemsToAdd.length} added`
      )
    } else {
      // Create a new cart for the customer
      const email =
        existingCart?.email ||
        (customerId
          ? (await resolveCustomerEmail(customerId, query))
          : `mobile-${device_id || Date.now()}@eatsie.local`)

      const freshCart = await cartService.createCart({
        email,
        currency_code,
        region_id: regionId,
        sales_channel_id: salesChannelId,
        customer_id: customerId || undefined,
        metadata: {
          omnichannel_origin: true,
          device_id: device_id || null,
          synced_at: new Date().toISOString(),
        },
      })

      const newCartId = freshCart.id

      // Add merged items to the new cart
      await cartService.addLineItems(newCartId, [
        ...line_items.map((item: any) => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          title: item.title,
          product_id: item.product_id,
        })),
      ])

      // Re-fetch to get a complete cart object with items
      unifiedCart = await cartService.retrieveCart(newCartId)

      console.log(
        `[Omnichannel Sync] Created new cart ${newCartId} with ${line_items.length} reconciled item(s)`
      )
    }

    // ── Step 7: Return unified cart state ──────────────────────────---
    const cartId = existingCart ? targetCartId : unifiedCart?.id
    const finalCart = cartId ? await cartService.retrieveCart(cartId) : unifiedCart

    return res.status(201).json({
      synchronized: true,
      cart_id: finalCart?.id || cartId,
      merged_from: {
        web_cart_id: targetCartId || null,
        mobile_items_count: (mobile_items || []).length,
        customer_id: customerId || null,
        device_id: device_id || null,
      },
      items: line_items,
      item_count: line_items.length,
      total,
      currency_code,
      cart: finalCart,
    })
  } catch (error: any) {
    console.error("[Omnichannel Sync] Error:", error.message)
    return res.status(500).json({
      synchronized: false,
      message: error.message || "Cart synchronization failed",
    })
  }
}

// ── Small helper ───────────────────────────────────────────────────────────

/**
 * Resolves a customer's email from their ID via query.graph.
 */
async function resolveCustomerEmail(
  customerId: string,
  query: any
): Promise<string> {
  try {
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "email"],
      filters: { id: customerId },
    })
    return customers?.[0]?.email || `customer-${customerId.substring(0, 8)}@eatsie.local`
  } catch {
    return `customer-${customerId.substring(0, 8)}@eatsie.local`
  }
}
