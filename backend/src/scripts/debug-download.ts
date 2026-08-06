import { DIGITAL_ASSET_MODULE } from "../modules/digital-asset/index.js"

export default async function ({ container }: { container: any }) {
  const digitalAssetService = container.resolve(DIGITAL_ASSET_MODULE)
  const id = "dld_01KWPDE6690KDR0ER6MM231G10"
  
  try {
    const record = await digitalAssetService.retrieveDigitalOrderDownload(id)
    console.log("=== DB RECORD ===")
    console.log(JSON.stringify({
      id: record.id,
      customer_id: record.customer_id,
      order_id: record.order_id,
      line_item_id: record.line_item_id,
      product_id: record.product_id,
      variant_id: record.variant_id,
      digital_asset_id: record.digital_asset_id,
      status: record.status,
      is_paid: record.is_paid,
      is_active: record.is_active,
      remaining_downloads: record.remaining_downloads,
      created_at: record.created_at,
      updated_at: record.updated_at
    }, null, 2))
  } catch (e) {
    console.error("Failed to retrieve record:", e)
  }
}
