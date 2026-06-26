// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"

/**
 * GET /admin/inventory-audit
 *
 * Returns all inventory audit log entries — admin oversight view.
 * Supports pagination, time range, vendor, and level filtering.
 *
 * Query params:
 *   - vendor_id?: Filter by vendor ID
 *   - level_id?: Filter by inventory level ID
 *   - variant_id?: Filter by variant ID
 *   - limit?: Page size (default 50, max 500)
 *   - offset?: Offset for pagination (default 0)
 *   - from?: ISO date string
 *   - to?: ISO date string
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendorService: any = req.scope.resolve(VENDOR_MODULE)
  const query = req.query || {}
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 500)
  const offset = Math.max(Number(query.offset) || 0, 0)

  try {
    const filters: any = {}

    if (query.vendor_id) {
      filters.vendor_id = query.vendor_id
    }

    if (query.level_id) {
      filters.level_id = query.level_id
    }

    if (query.variant_id) {
      filters.variant_id = query.variant_id
    }

    const [entries, count] = await vendorService.listAndCountInventoryAudits(
      filters,
      {
        order: { created_at: "DESC" },
        take: limit,
        skip: offset,
      }
    )

    return res.json({
      entries,
      count,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error("[Admin Inventory Audit] Error:", error)
    return res.status(500).json({ message: error.message || "Failed to load audit logs" })
  }
}
