import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const query = req.scope.resolve("query")
    const { data: vendorLocations } = await query.graph({
      entity: "vendor_stock_location",
      fields: ["id", "vendor_id", "stock_location_id"],
      filters: { vendor_id: vendor.id },
    })

    const linkedIds = (vendorLocations || []).map((vl: any) => vl.stock_location_id)

    if (linkedIds.length === 0) {
      return res.json({ locations: [] })
    }

    const stockLocationService: any = req.scope.resolve(Modules.STOCK_LOCATION)
    const locations: Array<{ id: string; name: string }> = []

    for (const locId of linkedIds) {
      try {
        const loc = await stockLocationService.retrieveStockLocation(locId)
        if (loc && !loc.deleted_at) {
          locations.push({
            id: loc.id,
            name: loc.name || "Warehouse",
          })
        }
      } catch {
        // skip invalid locations
      }
    }

    return res.json({ locations })
  } catch (error: any) {
    console.error("[VENDOR_STOCK_LOCATIONS_ERROR]", error.message)
    return res.status(500).json({ message: "Failed to load stock locations" })
  }
}