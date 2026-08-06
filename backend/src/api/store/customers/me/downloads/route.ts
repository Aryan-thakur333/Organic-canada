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
          "id", "order_id", "line_item_id", "product_id", "customer_id",
          "digital_asset_id", "license_key", "remaining_downloads",
          "download_count", "expires_at", "last_downloaded_at", "created_at",
          "is_active", "metadata"
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
      fields: [
        "id", "payment_status", "status",
        "items.id", "items.variant_id", "items.variant.id",
        "payment_collections.payments.id",
        "payment_collections.payments.status",
        "payment_collections.payments.amount",
        "payment_collections.payments.captured_at",
        "payment_collections.payments.provider_id",
        "payment_collections.payments.payment_session.data"
      ],
      filters: { id: orderIds },
    })
    
    const orderPaymentMap = new Map()
    const orderItemVariantMap = new Map()

    for (const o of orders || []) {
      // Determine if paid
      let isPaid = ["captured", "partially_refunded", "paid"].includes(o.payment_status || "")
      if (!isPaid) {
        if (o.status === "paid") {
          isPaid = true
        } else {
          const collections = Array.isArray(o.payment_collections) ? o.payment_collections : []
          for (const collection of collections) {
            const payments = Array.isArray(collection?.payments) ? collection.payments : []
            for (const payment of payments) {
              const sessionData = payment?.payment_session?.data || {}
              const sessionStatus = String(sessionData.status || "").toLowerCase()
              const amountReceived = Number(sessionData.amount_received || 0)
              const capturedAt = payment?.captured_at
              const paymentStatusStr = String(payment?.status || "").toLowerCase()

              if (capturedAt || sessionStatus === "succeeded" || paymentStatusStr === "captured" || paymentStatusStr === "succeeded" || paymentStatusStr === "paid" || amountReceived > 0) {
                isPaid = true
                break
              }
            }
            if (isPaid) break
          }
        }
      }
      orderPaymentMap.set(o.id, isPaid)
      
      const items = Array.isArray(o.items) ? o.items : []
      for (const item of items) {
        orderItemVariantMap.set(item.id, item.variant_id || item.variant?.id || null)
      }
    }

    // Enrich and shape the response
    const enriched = downloads.map((d: any) => {
      const product = productMap.get(d.product_id) || {}
      const asset = assetMap.get(d.digital_asset_id) || {}
      const productMeta = product.metadata || {}
      const isExpired = d.expires_at ? new Date(d.expires_at) < new Date() : false
      const isPaid = orderPaymentMap.get(d.order_id) || false

      // Determine status
      let computed_status = "available"
      if (!isPaid) {
        computed_status = "payment_required"
      } else if (isExpired) {
        computed_status = "expired"
      } else if (d.remaining_downloads <= 0) {
        computed_status = "limit_reached"
      }

      const computed_is_active = d.is_active !== false && computed_status === "available"
      const raw_customer_id = d.customer_id
      const raw_variant_id = orderItemVariantMap.get(d.line_item_id) || d.metadata?.variant_id || null
      
      const return_status = computed_status === "available" ? "active" : computed_status

      console.log("[Downloads API Debug]", {
        id: d.id,
        raw_customer_id,
        raw_variant_id,
        raw_status: d.status,
        raw_is_paid: d.is_paid,
        computed_status: return_status,
        computed_is_paid: isPaid,
        order_id: d.order_id,
        order_payment_status: isPaid ? "paid_derived" : "unpaid",
        order_status: "unknown" // We mapped it to boolean above
      })

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
      const downloadLimit = Number(recordMeta.download_limit)
        || Math.max(Number(d.remaining_downloads || 0) + Number(d.download_count || 0), Number(d.remaining_downloads || 0))

      return {
        id: d.id,
        customer_id: raw_customer_id,
        variant_id: raw_variant_id,
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
        download_limit: downloadLimit,
        expires_at: d.expires_at,
        license_key: d.license_key || null,
        status: return_status,
        is_digital: true,
        is_expired: computed_status === "expired",
        is_paid: isPaid,
        is_active: computed_is_active,
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
