// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { DIGITAL_ASSET_MODULE } from "../../../../modules/digital-asset"

/**
 * GET /store/orders/downloads
 *
 * Returns all digital download records for the authenticated customer.
 * Each record includes the product title, asset details, remaining downloads,
 * expiry date, and license key (if applicable).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required." })
  }

  try {
    const digitalAssetService: any = req.scope.resolve(DIGITAL_ASSET_MODULE)
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // Fetch all digital order downloads for this customer
    const downloads = await digitalAssetService.listDigitalOrderDownloads(
      { customer_id: customerId, is_active: true },
      { 
        select: [
          "id", "order_id", "line_item_id", "product_id", 
          "digital_asset_id", "license_key", "remaining_downloads",
          "download_count", "expires_at", "last_downloaded_at", "created_at"
        ]
      }
    )

    if (!downloads?.length) {
      return res.json({ downloads: [] })
    }

    // Batch fetch product info and digital asset info
    const productIds = [...new Set(downloads.map((d: any) => d.product_id))]
    const assetIds = [...new Set(downloads.map((d: any) => d.digital_asset_id))]

    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "thumbnail", "metadata"],
      filters: { id: productIds },
    })

    const productMap = new Map()
    for (const p of products || []) {
      productMap.set(p.id, p)
    }

    const assets = await digitalAssetService.listDigitalAssets(
      { id: assetIds },
      { select: ["id", "file_name", "mime_type", "file_size", "version", "product_id"] }
    )
    const assetMap = new Map()
    for (const a of assets || []) {
      assetMap.set(a.id, a)
    }

    // Enrich downloads with product & asset info
    const enriched = downloads.map((d: any) => {
      const product = productMap.get(d.product_id) || {}
      const asset = assetMap.get(d.digital_asset_id) || {}
      const isExpired = d.expires_at ? new Date(d.expires_at) < new Date() : false

      return {
        id: d.id,
        order_id: d.order_id,
        product_id: d.product_id,
        product_title: product.title || "Unknown Product",
        product_handle: product.handle || "",
        product_thumbnail: product.thumbnail || null,
        is_digital: true,
        file_name: asset.file_name || "",
        mime_type: asset.mime_type || "",
        file_size: asset.file_size || 0,
        version: asset.version || product.metadata?.version || "",
        license_key: d.license_key,
        remaining_downloads: d.remaining_downloads,
        download_count: d.download_count,
        expires_at: d.expires_at,
        is_expired: isExpired,
        last_downloaded_at: d.last_downloaded_at,
        created_at: d.created_at,
      }
    })

    return res.json({ downloads: enriched })
  } catch (error: any) {
    console.error("[Downloads] List error:", error)
    return res.status(500).json({ message: "Failed to fetch downloads" })
  }
}
