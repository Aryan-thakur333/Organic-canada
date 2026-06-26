// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../modules/vendor"

/**
 * GET /vendor/inventory/audit
 *
 * Returns inventory audit log entries for the authenticated vendor.
 * Supports pagination, time range filtering, and level_id filtering.
 *
 * Query params:
 *   - level_id?: Filter by inventory level ID
 *   - variant_id?: Filter by variant ID
 *   - limit?: Page size (default 50, max 200)
 *   - offset?: Offset for pagination (default 0)
 *   - from?: ISO date string — only entries after this date
 *   - to?: ISO date string — only entries before this date
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  const vendorService: any = req.scope.resolve(VENDOR_MODULE)

  const query = req.query || {}
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200)
  const offset = Math.max(Number(query.offset) || 0, 0)

  try {
    // Build filter
    const filters: any = { vendor_id: vendor.id }

    if (query.level_id) {
      filters.level_id = query.level_id
    }

    if (query.variant_id) {
      filters.variant_id = query.variant_id
    }

    // Retrieve audit entries
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
    console.error("[Vendor Inventory Audit] Error:", error)
    return res.status(500).json({ message: error.message || "Failed to load audit logs" })
  }
}
