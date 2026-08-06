import { Modules } from "@medusajs/framework/utils"

type ResolveLocationInput = {
  container: any
  vendorId: string
  vendorOrder?: any
  requestedLocationId?: string | null
}

type ResolvedLocation = {
  id: string
  name: string
  vendor_id: string
  is_valid: true
}

/**
 * Resolve a vendor's stock location with the following priority:
 * 1. requestedLocationId from validated request body
 * 2. VendorOrder.metadata.stock_location_id
 * 3. VendorOrder.metadata.location_id
 * 4. a Vendor ↔ StockLocation module link
 * 5. exactly one valid stock location assigned to this vendor
 * 
 * Never returns "default" or a location name.
 * Throws structured errors for 422/403 responses.
 */
export async function resolveVendorStockLocation(
  input: ResolveLocationInput
): Promise<ResolvedLocation> {
  const { container, vendorId, vendorOrder, requestedLocationId } = input

  // Phase 1: Gather candidates
  let candidateLocationIds: string[] = []

  if (requestedLocationId) {
    candidateLocationIds.push(requestedLocationId)
  }

  if (vendorOrder?.metadata?.stock_location_id) {
    candidateLocationIds.push(vendorOrder.metadata.stock_location_id)
  }

  if (vendorOrder?.metadata?.location_id) {
    candidateLocationIds.push(vendorOrder.metadata.location_id)
  }

  // Phase 2: Resolve vendor stock locations via the module link
  const query = container.resolve("query")
  const { data: vendorLocations } = await query.graph({
    entity: "vendor_stock_location", // auto-generated link table
    fields: ["id", "vendor_id", "stock_location_id"],
    filters: { vendor_id: vendorId },
  })

  const linkedLocationIds = (vendorLocations || []).map(
    (vl: any) => vl.stock_location_id
  )

  // Also link direct vendor-stock_location
  if (linkedLocationIds.length > 0) {
    candidateLocationIds.push(...linkedLocationIds)
  }

  // Phase 3: Deduplicate and validate
  const uniqueIds = [...new Set(candidateLocationIds.filter(Boolean))]

  if (uniqueIds.length === 0) {
    throw Object.assign(new Error("No stock location is assigned to this vendor."), {
      code: "VENDOR_STOCK_LOCATION_REQUIRED",
    })
  }

  // Phase 4: Validate each candidate exists and is linked to vendor
  const stockLocationService: any = container.resolve(Modules.STOCK_LOCATION)
  
  for (const locId of uniqueIds) {
    let location: any
    try {
      location = await stockLocationService.retrieveStockLocation(locId)
    } catch {
      continue // location doesn't exist
    }

    if (!location || location.deleted_at) {
      continue
    }

    // Check ownership: location must be linked to this vendor
    const isLinked = linkedLocationIds.includes(locId)
    if (!isLinked) {
      // If requested explicitly, reject with 403
      if (requestedLocationId === locId) {
        throw Object.assign(
          new Error("You cannot use this stock location."),
          { code: "VENDOR_STOCK_LOCATION_FORBIDDEN" }
        )
      }
      continue // skip unlinked locations found via metadata
    }

    console.log("[VENDOR_STOCK_LOCATION_RESOLVED]", JSON.stringify({
      vendorId,
      requestedLocationId: requestedLocationId || null,
      resolvedLocationId: location.id,
      resolvedLocationName: location.name,
      source: uniqueIds.indexOf(locId) === 0 ? "requested" : "linked",
    }))

    return {
      id: location.id,
      name: location.name || "Warehouse",
      vendor_id: vendorId,
      is_valid: true,
    }
  }

  // Phase 5: If requested location doesn't exist or isn't linked
  if (requestedLocationId) {
    throw Object.assign(
      new Error("The selected stock location does not exist."),
      { code: "VENDOR_STOCK_LOCATION_INVALID" }
    )
  }

  throw Object.assign(new Error("No stock location is assigned to this vendor."), {
    code: "VENDOR_STOCK_LOCATION_REQUIRED",
  })
}