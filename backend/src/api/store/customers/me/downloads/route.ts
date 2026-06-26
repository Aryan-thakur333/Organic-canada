// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { DIGITAL_ASSET_MODULE } from "../../../../../modules/digital-asset"

/**
 * GET /store/customers/me/downloads
 *
 * Returns all purchased digital downloads for the authenticated customer.
 * Only returns items from paid/captured orders.
 * Never exposes raw file storage paths.
 *
 * Response shape:
 * {
 *   downloads: [
 *     {
 *       asset_id: "asset_xxx",
 *       order_id: "order_xxx",
 *       item_id: "item_xxx",
 *       product_title: "PDF Guide",
 *       filename: "guide.pdf",
 *       mime_type: "application/pdf",
 *       size: 12345,
 *       version: "1.0",
 *       remaining_downloads: 4,
 *       download_limit: 5,
 *       expires_at: "2027-01-01T00:00:00.000Z",
 *       status: "available",
 *       download_url: "/store/downloads/asset_xxx"
 *     }
 *   ]
 * }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required." })
  }

  try {
    const digitalAssetService: any = req.scope.resolve(DIGITAL_ASSET_MODULE)
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // Fetch all digital order downloads for this customer (including inactive/expired)
    const downloads = await digitalAssetService.listDigitalOrderDownloads(
      { customer_id: customerId },
      { 
        select: [
          "id", "order_id", "line_item_id", "product_id",
          "digital_asset_id", "license_key", "remaining_downloads",
          "download_count", "expires_at", "last_downloaded_at", "created_at",
          "is_active"
        ],
        order: { created_at: "DESC" }
      }
    )

    if (!downloads?.length) {
      return res.json({ downloads: [] })
    }

    // Fetch product info (title, handle, thumbnail, metadata)
    const productIds = [...new Set(downloads.map((d: any) => d.product_id))]
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "thumbnail", "metadata", "type.value"],
      filters: { id: productIds },
    })
    const productMap = new Map()
    for (const p of products || []) {
      productMap.set(p.id, p)
    }

    // Fetch digital assets for file info
    const assetIds = [...new Set(downloads.map((d: any) => d.digital_asset_id).filter(Boolean))]
    const assets = assetIds.length > 0
      ? await digitalAssetService.listDigitalAssets(
          { id: assetIds },
          { select: ["id", "file_name", "mime_type", "file_size", "version", "product_id"] }
        )
      : []
    const assetMap = new Map()
    for (const a of assets || []) {
      assetMap.set(a.id, a)
    }

    // Verify order payment status for each download
    const orderIds = [...new Set(downloads.map((d: any) => d.order_id))]
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "payment_status", "status"],
      filters: { id: orderIds },
    })
    const orderPaymentMap = new Map()
    for (const o of orders || []) {
      orderPaymentMap.set(o.id, o.payment_status || o.status)
    }

    // Enrich and shape the response
    const enriched = downloads.map((d: any) => {
      const product = productMap.get(d.product_id) || {}
      const asset = assetMap.get(d.digital_asset_id) || {}
      const productMeta = product.metadata || {}
      const isExpired = d.expires_at ? new Date(d.expires_at) < new Date() : false
      const paymentStatus = orderPaymentMap.get(d.order_id) || "pending"

      // Determine payment status - only allow download from paid orders
      const isPaid = ["captured", "partially_refunded", "paid"].includes(paymentStatus)

      // Determine status
      let status = "available"
      if (!isPaid) {
        status = "payment_required"
      } else if (isExpired) {
        status = "expired"
      } else if (d.remaining_downloads <= 0) {
        status = "limit_reached"
      }

      // Get file info from download record metadata (stored during order placement)
      const recordMeta = d.metadata || {}

      // Determine filename - prefer record metadata, then asset, then product metadata
      const filename = recordMeta.file_name
        || asset.file_name
        || productMeta.file_name
        || ""

      const mimeType = recordMeta.mime_type
        || asset.mime_type
        || productMeta.mime_type
        || ""

      const fileSize = recordMeta.file_size
        || asset.file_size
        || productMeta.file_size
        || 0

      const version = recordMeta.version
        || asset.version
        || productMeta.version
        || ""

      return {
        id: d.id,
        asset_id: d.digital_asset_id || `asset_${d.id?.slice(-12)}`,
        order_id: d.order_id,
        item_id: d.line_item_id,
        product_id: d.product_id,
        product_title: product.title || "Unknown Product",
        product_handle: product.handle || "",
        product_thumbnail: product.thumbnail || null,
        product_type: product.type?.value || "",
        filename,
        mime_type: mimeType,
        size: fileSize,
        version,
        download_count: d.download_count || 0,
        remaining_downloads: d.remaining_downloads || 0,
        download_limit: Math.max(d.remaining_downloads || 0, d.download_count || 0) + (d.remaining_downloads || 0),
        expires_at: d.expires_at,
        license_key: d.license_key || null,
        status,
        is_digital: true,
        is_expired: status === "expired",
        is_paid: isPaid,
        is_active: d.is_active !== false && status === "available",
        download_url: isPaid
          ? `/store/downloads/${d.id}`
          : null,
        created_at: d.created_at,
        last_downloaded_at: d.last_downloaded_at,
      }
    })

    return res.json({ downloads: enriched })
  } catch (error: any) {
    console.error("[Customer Downloads] Error:", error)
    if (error.type === MedusaError.Types.NOT_FOUND) {
      return res.status(404).json({ message: "Downloads not found." })
    }
    return res.status(500).json({ message: "Failed to fetch downloads." })
  }
}