import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// ── Types ──────────────────────────────────────────────────────────────────

type PosInventorySyncBody = {
  /** Product variant SKU that was sold */
  sku: string
  /** New physical stock count after the sale (absolute, not delta) */
  new_quantity_count: number
  /** Optional POS location identifier for multi-store setups */
  location_id?: string
  /** Optional sale metadata */
  transaction_id?: string
  sale_timestamp?: string
}

type PosInventorySyncResponse = {
  success: boolean
  inventory_item_id: string
  variant_id: string | null
  previous_quantity: number
  new_quantity: number
  delta: number
  location_id: string
}

const POS_API_KEY = process.env.POS_API_KEY || ""

/**
 * POST /store/pos/inventory-sync
 *
 * Inbound webhook that physical POS registers call whenever a product sells
 * out over-the-counter. This endpoint resolves the variant by SKU, queries
 * the current inventory level at the specified (or first available) location,
 * and applies the absolute stock correction via `adjustInventory`.
 *
 * Authentication: Bearer token in Authorization header matching POS_API_KEY env.
 *
 * Request body:
 * ```json
 * {
 *   "sku": "SHIRT-M-BLACK",
 *   "new_quantity_count": 42,
 *   "location_id": "loc_01J..." // optional, resolves first if omitted
 * }
 * ```
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // ── 1. Authenticate ─────────────────────────────────────────────────────
  const authHeader = req.headers.authorization || ""
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()

  if (POS_API_KEY && token !== POS_API_KEY) {
    return res.status(401).json({
      message: "Invalid or missing API key. Provide a valid Bearer token.",
    })
  }

  // ── 2. Validate body ────────────────────────────────────────────────────
  const body = req.body as PosInventorySyncBody | undefined

  if (!body || !body.sku || body.new_quantity_count == null) {
    return res.status(400).json({
      message: "Missing required fields: sku, new_quantity_count",
    })
  }

  const { sku, new_quantity_count, location_id } = body

  try {
    // ── 3. Resolve services ───────────────────────────────────────────────
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const inventoryService: any = req.scope.resolve(Modules.INVENTORY)

    // ── 4. Resolve variant by SKU ─────────────────────────────────────────
    const { data: variants } = await query.graph({
      entity: "variant",
      fields: [
        "id",
        "sku",
        "title",
        "product.id",
        "product.title",
        "inventory_items.inventory_item_id",
        "inventory_items.required_quantity",
      ],
      filters: { sku },
      pagination: { take: 1 },
    })

    const variant = variants?.[0]
    if (!variant) {
      return res.status(404).json({
        message: `Variant with SKU "${sku}" not found`,
      })
    }

    const inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id
    if (!inventoryItemId) {
      return res.status(404).json({
        message: `Variant "${sku}" has no linked inventory item`,
      })
    }

    // ── 5. Resolve target inventory level ─────────────────────────────────
    const levelFilter: Record<string, unknown> = {
      inventory_item_id: inventoryItemId,
    }
    if (location_id) {
      levelFilter.location_id = location_id
    }

    const levels: Array<{
      id: string
      location_id: string
      stocked_quantity: number
      reserved_quantity: number
    }> = await inventoryService.listInventoryLevels(levelFilter, { take: 1 })

    if (levels.length === 0) {
      return res.status(404).json({
        message: `No inventory level found for item ${inventoryItemId}` +
          (location_id ? ` at location ${location_id}` : ""),
      })
    }

    const level = levels[0]
    const previousQuantity = level.stocked_quantity ?? 0
    const delta = new_quantity_count - previousQuantity

    // ── 6. Apply absolute stock correction ─────────────────────────────────
    await inventoryService.adjustInventory(level.id, {
      inventory_item_id: inventoryItemId,
      location_id: level.location_id,
      adjustment: delta,
    })

    const response: PosInventorySyncResponse = {
      success: true,
      inventory_item_id: inventoryItemId,
      variant_id: variant.id,
      previous_quantity: previousQuantity,
      new_quantity: new_quantity_count,
      delta,
      location_id: level.location_id,
    }

    console.log(
      `[POS InventorySync] Variant "${variant.sku || sku}" (${variant.id}): ` +
      `${previousQuantity} → ${new_quantity_count} (Δ${delta >= 0 ? "+" : ""}${delta}) ` +
      `at location ${level.location_id}`
    )

    return res.status(200).json(response)
  } catch (error: any) {
    console.error("[POS InventorySync] Error:", error.message)
    return res.status(500).json({
      message: error.message || "Failed to sync POS inventory",
    })
  }
}
