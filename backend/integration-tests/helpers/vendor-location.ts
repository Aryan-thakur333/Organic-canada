import { Modules } from "@medusajs/framework/utils"
import { createStockLocationsWorkflow, linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"

interface EnsureVendorStockLocationInput {
  container: any
  vendorId: string
  storeName?: string
}

export async function ensureVendorStockLocation({
  container,
  vendorId,
  storeName = "TestVendor"
}: EnsureVendorStockLocationInput): Promise<{ locationId: string; salesChannelId: string }> {
  console.log(`[SETUP] location-start for vendor=${vendorId}`)

  // 1. Resolve stock location module
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)

  // 2. Resolve sales channel module
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)

  // 3. Find test/default sales channel
  const [salesChannel] = await salesChannelService.listSalesChannels(
    { is_disabled: false },
    { take: 1 }
  )

  // 4. Fail explicitly if no sales channel exists
  if (!salesChannel) {
    throw new Error(
      `[TEST_SETUP_LOCATION] Failed: No active sales channel exists. Ensure DB is seeded or migration has run.`
    )
  }

  // 5. Create vendor stock location
  let stockLocation
  try {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: `${storeName} Warehouse`,
            address: {
              city: "Toronto",
              country_code: "CA",
              address_1: "Vendor Warehouse Location",
            },
          },
        ],
      },
    })
    stockLocation = result?.[0]
  } catch (err: any) {
    throw new Error(
      `[TEST_SETUP_LOCATION] Failed to create stock location. error=${err.message}`
    )
  }

  if (!stockLocation?.id) {
    throw new Error(`[TEST_SETUP_LOCATION] Created stock location is missing an ID.`)
  }

  const locationId = stockLocation.id
  const salesChannelId = salesChannel.id

  // 6. Create vendor-location link using actual project link architecture
  const link = container.resolve("remoteLink")
  try {
    await link.create({
      vendor: { vendor_id: vendorId },
      stock_location: { stock_location_id: locationId }
    })
  } catch (err: any) {
    throw new Error(
      `[TEST_SETUP_LOCATION] Failed to create vendor-location link in remoteLink. error=${err.message}`
    )
  }

  // 7. Create location-sales-channel link
  try {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: locationId, add: [salesChannelId] },
    })
  } catch (err: any) {
    throw new Error(
      `[TEST_SETUP_LOCATION] Failed to link sales channel to stock location. error=${err.message}`
    )
  }

  // 8. Verify link exists
  const query = container.resolve("query")
  const { data: vendorLocations } = await query.graph({
    entity: "vendor_stock_location",
    fields: ["id", "vendor_id", "stock_location_id"],
    filters: { vendor_id: vendorId, stock_location_id: locationId },
  })

  if (!vendorLocations || vendorLocations.length === 0) {
    throw new Error(
      `[TEST_SETUP_LOCATION] Verification failed: vendor-stock-location link was not persisted in database.`
    )
  }

  console.log(`[SETUP] location-ready locationId=${locationId} salesChannelId=${salesChannelId}`)

  // 9. Return locationId and salesChannelId
  return {
    locationId,
    salesChannelId
  }
}
