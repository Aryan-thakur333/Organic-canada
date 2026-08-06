import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework"
import type { StockLocationDTO } from "@medusajs/framework/types"
import { createStockLocationsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Idempotent setup script that creates or reuses a Medusa Stock Location
 * for a vendor and links it using the registered module-link.
 * 
 * Usage:
 *   npx medusa exec ./src/scripts/setup-vendor-stock-location.ts
 */
export default async function setupVendorStockLocation({
  container,
}: {
  container: MedusaContainer
}) {
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  console.log("[VENDOR_LOCATION_SETUP_START]")

  // ── Resolve vendor by email ─────────────────────────────────────────────
  const vendorEmail = process.env.VENDOR_EMAIL || "vendortest@gmail.com"
  
  // Query vendor using the vendor module
  const vendorModule = container.resolve("vendor")
  const vendors = await vendorModule.listVendors({ email: vendorEmail })
  
  if (!vendors || vendors.length === 0) {
    console.log("[VENDOR_LOCATION_SETUP_ERROR] Vendor not found:", vendorEmail)
    return
  }

  const vendor = vendors[0]
  console.log("[VENDOR_FOUND]", JSON.stringify({
    vendor_id: vendor.id,
    vendor_email: vendor.email,
    vendor_name: vendor.store_name || vendor.name,
  }))

  // ── Check existing vendor-stock-location links ──────────────────────────
  const { data: existingLinks } = await query.graph({
    entity: "vendor_stock_location",
    fields: ["id", "vendor_id", "stock_location_id"],
    filters: { vendor_id: vendor.id },
  })

  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)

  // Try to reuse an existing valid linked location
  let stockLocation: StockLocationDTO | null = null

  if (existingLinks && existingLinks.length > 0) {
    for (const linkRecord of existingLinks) {
      try {
        const loc = await stockLocationService.retrieveStockLocation(linkRecord.stock_location_id)
        if (loc && !loc.deleted_at) {
          stockLocation = loc
          console.log("[VENDOR_LOCATION_EXISTING]", JSON.stringify({
            stock_location_id: loc.id,
            stock_location_name: loc.name,
            reused: true,
          }))
          break
        }
      } catch {
        // Skip deleted/invalid locations
      }
    }
  }

  // ── Create new location if none found ────────────────────────────────────
  if (!stockLocation) {
    console.log("[VENDOR_LOCATION_CREATING] No existing valid location found. Creating...")

    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: `${vendor.store_name || "Aryan"} Vendor Warehouse`,
            address: {
              city: "Toronto",
              country_code: "CA",
              address_1: "",
            },
          },
        ],
      },
    })

    stockLocation = result[0] ?? null
    if (!stockLocation) {
      throw new Error("VENDOR_STOCK_LOCATION_CREATE_RETURNED_EMPTY_RESULT")
    }
    console.log("[VENDOR_LOCATION_CREATED]", JSON.stringify({
      stock_location_id: stockLocation.id,
      stock_location_name: stockLocation.name,
    }))

    // ── Link fulfillment provider to stock location ────────────────────────
    try {
      await link.create({
        [Modules.STOCK_LOCATION]: {
          stock_location_id: stockLocation.id,
        },
        [Modules.FULFILLMENT]: {
          fulfillment_provider_id: "manual_manual",
        },
      })
    } catch (linkErr: any) {
      console.log("[VENDOR_LOCATION_PROVIDER_LINK]", linkErr.message)
    }
  }

  // ── Create the vendor-to-stock-location link ────────────────────────────
  const linkExists = (existingLinks || []).some(
    (l: any) => l.stock_location_id === stockLocation.id
  )

  if (!linkExists) {
    try {
      await link.create({
        vendor: {
          vendor_id: vendor.id,
        },
        stock_location: {
          stock_location_id: stockLocation.id,
        },
      })
      console.log("[VENDOR_LOCATION_LINK_CREATED]", JSON.stringify({
        vendor_id: vendor.id,
        stock_location_id: stockLocation.id,
      }))
    } catch (linkErr: any) {
      // If link already exists, that's fine
      if (!linkErr.message?.includes("already exists") && !linkErr.message?.includes("duplicate")) {
        console.error("[VENDOR_LOCATION_LINK_ERROR]", linkErr.message)
        throw linkErr
      }
      console.log("[VENDOR_LOCATION_LINK_EXISTING] Link already exists")
    }
  } else {
    console.log("[VENDOR_LOCATION_LINK_EXISTING] Link already exists")
  }

  // ── Verify ──────────────────────────────────────────────────────────────
  console.log("[VENDOR_LOCATION_VERIFIED]", JSON.stringify({
    stock_location_id: stockLocation.id,
    stock_location_name: stockLocation.name,
    starts_with_sloc: stockLocation.id.startsWith("sloc_"),
    link_status: "active",
  }))

  // ── Verify via the vendor API ────────────────────────────────────────────
  const { data: verifyLinks } = await query.graph({
    entity: "vendor_stock_location",
    fields: ["id", "vendor_id", "stock_location_id"],
    filters: { vendor_id: vendor.id, stock_location_id: stockLocation.id },
  })

  const verified = (verifyLinks || []).length > 0
  console.log("[VENDOR_LOCATION_SETUP_VERIFIED]", JSON.stringify({
    vendor_id: vendor.id,
    vendor_email: vendor.email,
    stock_location_id: stockLocation.id,
    stock_location_name: stockLocation.name,
    link_verified: verified,
  }))

  // ── Summary ─────────────────────────────────────────────────────────────
  if (verified) {
    console.log(`\n✅ Vendor "${vendor.store_name || vendor.name}" is now linked to stock location:`)
    console.log(`   ID:   ${stockLocation.id}`)
    console.log(`   Name: ${stockLocation.name}`)
    console.log("\nYou can now use this ID in the vendor fulfillment flow.")
  } else {
    console.error("\n❌ Failed to verify vendor-stock-location link!")
  }

  console.log("[VENDOR_LOCATION_SETUP_DONE]")
  
  return {
    vendor_id: vendor.id,
    stock_location_id: stockLocation.id,
    stock_location_name: stockLocation.name,
  }
}
