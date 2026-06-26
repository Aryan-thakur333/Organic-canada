// @ts-nocheck
import { Modules } from "@medusajs/framework/utils"
import { DIGITAL_ASSET_MODULE } from "../modules/digital-asset"

type SubscriberArgs = {
  event: string
  data: any
  container: any
}

/**
 * When an order is placed, check if it contains digital products.
 * For each digital line item, create a DigitalOrderDownload record
 * so the customer can download their files.
 */
export default async function handleOrderPlaced({ event, data, container }: SubscriberArgs) {
  const orderId = data.id
  if (!orderId) return

  const logger = container.resolve("logger")
  logger?.info(`[OrderDigitalDownloads] Processing order ${orderId} for digital downloads...`)

  try {
    const query = container.resolve("query")
    const digitalAssetService = container.resolve(DIGITAL_ASSET_MODULE)

    // Fetch the order with line items and product info
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "customer_id",
        "email",
        "status",
        "payment_status",
        "items.id",
        "items.product_id",
        "items.variant_id",
        "items.title",
        "items.quantity",
        "items.metadata",
      ],
      filters: { id: orderId },
    })

    const order = orders?.[0]
    if (!order) {
      logger?.warn(`[OrderDigitalDownloads] Order ${orderId} not found.`)
      return
    }

    // Get all digital assets (files linked to products)
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "metadata",
        "digital_asset.id",
        "digital_asset.product_id",
        "digital_asset.file_name",
        "digital_asset.mime_type",
        "digital_asset.file_size",
        "digital_asset.version",
        "digital_asset.download_limit",
        "digital_asset.is_active",
      ],
      pagination: { take: 500 },
    })

    // Build a map of product_id → product info
    const productMap = new Map()
    for (const product of products || []) {
      productMap.set(product.id, product)
    }

    // Filter line items that are digital products
    const digitalItems = (order.items || []).filter((item: any) => {
      const product = productMap.get(item.product_id)
      if (!product) return false

      // Check metadata on both product and line item
      const productMetadata = product.metadata || {}
      const itemMetadata = item.metadata || {}

      // Digital detection logic - check product type, metadata, and digital_asset links
      const isDigital =
        productMetadata.is_digital === true ||
        productMetadata.is_digital === "true" ||
        itemMetadata.is_digital === true ||
        itemMetadata.is_digital === "true" ||
        (product.digital_asset && product.digital_asset.length > 0) ||
        product.type?.value === "Digital Product"

      return isDigital
    })

    if (!digitalItems.length) {
      logger?.info(`[OrderDigitalDownloads] No digital items found in order ${orderId}.`)
      return
    }

    logger?.info(`[OrderDigitalDownloads] Found ${digitalItems.length} digital items in order ${orderId}.`)

    // Get the order metadata for default download settings (if any)
    const orderMetadata = order.metadata || {}

    // Determine download settings (from product metadata or defaults)
    const defaultDownloadLimit = 5
    const defaultExpiryDays = 365

    // Create DigitalOrderDownload records for each digital line item asset
    const downloadRecords = []

    for (const item of digitalItems) {
      const product = productMap.get(item.product_id)
      if (!product) continue

      const productMetadata = product.metadata || {}
      const assets = product.digital_asset || []

      const downloadLimit = Number(productMetadata.download_limit) || defaultDownloadLimit
      const expiryDays = Number(productMetadata.download_expiry_days) || defaultExpiryDays
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expiryDays)

      // Generate a license key if required
      let licenseKey = null
      if (productMetadata.license_required === true || productMetadata.license_required === "true") {
        licenseKey = generateLicenseKey(product.id, orderId, item.id)
      }

      // Get download_assets from product metadata for storage_key info
      const downloadAssets = productMetadata.download_assets || []

      if (!assets.length && !downloadAssets.length) {
        // No assets at all - create a record from product metadata
        downloadRecords.push({
          order_id: orderId,
          line_item_id: item.id,
          product_id: item.product_id,
          customer_id: order.customer_id,
          digital_asset_id: null,
          license_key: licenseKey,
          remaining_downloads: downloadLimit,
          download_count: 0,
          expires_at: expiresAt,
          is_active: true,
          metadata: {
            title: item.title,
            is_digital: true,
            version: productMetadata.version || "1.0.0",
            file_name: productMetadata.file_name || "",
            mime_type: productMetadata.mime_type || "",
            file_size: productMetadata.file_size || 0,
            storage_key: downloadAssets[0]?.storage_key || "",
          },
        })
      } else if (downloadAssets.length > 0) {
        // Create download records from product metadata download_assets
        for (const da of downloadAssets) {
          downloadRecords.push({
            order_id: orderId,
            line_item_id: item.id,
            product_id: item.product_id,
            customer_id: order.customer_id,
            digital_asset_id: null,
            license_key: licenseKey,
            remaining_downloads: downloadLimit,
            download_count: 0,
            expires_at: expiresAt,
            is_active: true,
            metadata: {
              title: item.title,
              is_digital: true,
              file_name: da.filename || productMetadata.file_name || "",
              mime_type: da.mime_type || productMetadata.mime_type || "",
              file_size: da.size || productMetadata.file_size || 0,
              version: da.version || productMetadata.version || "1.0.0",
              storage_key: da.storage_key || "",
            },
          })
        }
      } else {
        // Create a download record for each linked DigitalAsset
        for (const asset of assets) {
          if (!asset.is_active) continue
          downloadRecords.push({
            order_id: orderId,
            line_item_id: item.id,
            product_id: item.product_id,
            customer_id: order.customer_id,
            digital_asset_id: asset.id,
            license_key: licenseKey,
            remaining_downloads: downloadLimit,
            download_count: 0,
            expires_at: expiresAt,
            is_active: true,
            metadata: {
              title: item.title,
              is_digital: true,
              file_name: asset.file_name,
              mime_type: asset.mime_type,
              file_size: asset.file_size,
              version: asset.version || productMetadata.version || "1.0.0",
              storage_key: asset.secure_s3_key || "",
            },
          })
        }
      }
    }

    // Batch create all download records
    for (const record of downloadRecords) {
      try {
        await digitalAssetService.createDigitalOrderDownloads(record)
      } catch (err) {
        logger?.error(`[OrderDigitalDownloads] Failed to create download record: ${err.message}`, err)
      }
    }

    logger?.info(`[OrderDigitalDownloads] Created ${downloadRecords.length} download records for order ${orderId}.`)
  } catch (error: any) {
    logger?.error(`[OrderDigitalDownloads] Error processing order ${orderId}: ${error.message}`, error)
  }
}

/**
 * Generate a simple license key for digital products.
 * Format: PRODUCT-ORDER-HEXCHUNKS
 */
function generateLicenseKey(productId: string, orderId: string, itemId: string): string {
  const p = productId.slice(-8).toUpperCase()
  const o = orderId.slice(-8).toUpperCase()
  const i = itemId.slice(-4).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 10).toUpperCase()
  return `${p}-${o}-${i}-${rand}`
}

export const config = {
  event: "order.placed",
  context: {
    subscriberId: "order-digital-downloads-handler",
  },
}
