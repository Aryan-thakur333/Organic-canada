import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { DIGITAL_ASSET_MODULE } from "../../../../modules/digital-asset"
import path from "path"
import fs from "fs"

const STORAGE_DIR = path.join(process.cwd(), "uploads", "digital")

/**
 * GET /store/downloads/:id?order_id=order_xxx
 *
 * Secure download endpoint that serves digital asset files.
 * Authorization: Customer must own the order, payment must be captured.
 *
 * Supports two modes:
 * 1. DigitalOrderDownload ID (dld_xxx) - from /store/orders/downloads
 * 2. Asset ID with order_id query param - direct asset reference
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const orderId = (req.query as any).order_id as string | undefined
  const customerId = (req as any).auth_context?.actor_id as string | undefined

  if (!customerId) {
    return res.status(401).json({
      message: "Authentication required. Please log in to download digital assets.",
    })
  }

  try {
    const digitalAssetService: any = req.scope.resolve(DIGITAL_ASSET_MODULE)
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // ── Determine asset info and validation ──
    let orderLookupId: string
    let storageKey: string | null = null
    let fileName: string = "download"
    let mimeType: string = "application/octet-stream"
    let fileSize: number = 0
    let remainingDownloads: number = 0
    let downloadRecordId: string | null = null

    const isOrderDownload = id.startsWith("dld_")

    if (isOrderDownload) {
      // Mode 1: DigitalOrderDownload record (preferred - created proactively by order-placed subscriber)
      const downloadRecord = await digitalAssetService.retrieveDigitalOrderDownload(id).catch(() => null)
      if (!downloadRecord) {
        return res.status(404).json({ message: "Download record not found." })
      }

      // Verify ownership
      if (downloadRecord.customer_id !== customerId) {
        return res.status(403).json({ message: "This download does not belong to you." })
      }

      if (!downloadRecord.is_active) {
        return res.status(403).json({ message: "This download is no longer available." })
      }

      // Check expiry
      if (downloadRecord.expires_at && new Date(downloadRecord.expires_at) < new Date()) {
        return res.status(403).json({
          message: `Download expired on ${new Date(downloadRecord.expires_at).toLocaleDateString()}.`,
        })
      }

      // Check remaining downloads
      if (downloadRecord.remaining_downloads <= 0) {
        return res.status(403).json({
          message: "Download limit reached.",
          remaining_downloads: 0,
        })
      }

      orderLookupId = downloadRecord.order_id
      downloadRecordId = downloadRecord.id
      remainingDownloads = downloadRecord.remaining_downloads

      // Get metadata for file info
      const recordMeta = downloadRecord.metadata || {}
      storageKey = recordMeta.storage_key as string | undefined || null
      fileName = recordMeta.file_name as string || "download"
      mimeType = recordMeta.mime_type as string || "application/octet-stream"
      fileSize = Number(recordMeta.file_size) || 0

      // If no storage_key in metadata, try to get it from the linked asset
      if (!storageKey && downloadRecord.digital_asset_id) {
        try {
          const asset = await digitalAssetService.retrieveDigitalAsset(downloadRecord.digital_asset_id)
          if (asset) {
            storageKey = asset.secure_s3_key
            fileName = asset.file_name || fileName
            mimeType = asset.mime_type || mimeType
            fileSize = asset.file_size || fileSize
          }
        } catch {
          // continue with existing data
        }
      }

      // Verify order payment status
      const { data: orders } = (await query.graph({
        entity: "order",
        fields: ["id", "status", "payment_status", "customer_id"],
        filters: { id: orderLookupId },
      })) as any
      const order = orders?.[0] as any
      if (!order) {
        return res.status(404).json({ message: "Associated order not found." })
      }
      if (order.customer_id !== customerId) {
        return res.status(403).json({ message: "This order does not belong to you." })
      }

      const isPaid = ["captured", "partially_refunded", "paid"].includes(order.payment_status || "")
      if (!isPaid && order.status !== "completed") {
        return res.status(403).json({ message: "Payment must be completed before downloading." })
      }
    } else if (orderId) {
      // Mode 2: Legacy support - Asset ID with order_id query param
      orderLookupId = orderId

      // Verify order belongs to customer and is paid
      const { data: orders } = (await query.graph({
        entity: "order",
        fields: ["id", "status", "payment_status", "customer_id", "items.*"],
        filters: { id: orderLookupId },
      })) as any
      const order = orders?.[0] as any
      if (!order) {
        return res.status(404).json({ message: "Order not found." })
      }
      if (order.customer_id !== customerId) {
        return res.status(403).json({ message: "This order does not belong to you." })
      }

      const isPaid = ["captured", "partially_refunded", "paid"].includes(order.payment_status || "")
      if (!isPaid && order.status !== "completed") {
        return res.status(403).json({ message: "Payment must be completed before downloading." })
      }

      // Find the digital item in the order items
      const items: any[] = order.items || []
      const digitalItem = items.find((item: any) => {
        const meta = item.metadata || {}
        return meta.is_digital === true || meta.is_digital === "true"
      })

      if (!digitalItem) {
        return res.status(404).json({ message: "No digital items found in this order." })
      }

      // Extract storage_key from line item metadata or product metadata
      const itemMeta = digitalItem.metadata || {}
      const assets = itemMeta.download_assets || []
      const matchedAsset = assets.find((a: any) => a.id === id || a.id === `asset_${id}`)

      if (matchedAsset?.storage_key) {
        storageKey = matchedAsset.storage_key
        fileName = matchedAsset.filename || "download"
        mimeType = matchedAsset.mime_type || "application/octet-stream"
        fileSize = matchedAsset.size || 0
      } else {
        // Try to find from product metadata
        const { data: products } = (await query.graph({
          entity: "product",
          fields: ["id", "metadata"],
          filters: { id: digitalItem.product_id },
        })) as any
        const product = products?.[0]
        if (product) {
          const productMeta = product.metadata || {}
          const productAssets = productMeta.download_assets || []
          const productAsset = productAssets.find((a: any) => a.id === id || a.id === `asset_${id}`)
          if (productAsset?.storage_key) {
            storageKey = productAsset.storage_key
            fileName = productAsset.filename || "download"
            mimeType = productAsset.mime_type || "application/octet-stream"
            fileSize = productAsset.size || 0
          }
        }
      }

      // Check for existing download record to decrement
      const existingDownload = await digitalAssetService.listDigitalOrderDownloads(
        { order_id: orderLookupId, product_id: digitalItem.product_id, customer_id: customerId },
        { take: 1 }
      )
      if (existingDownload?.length > 0) {
        downloadRecordId = existingDownload[0].id
        remainingDownloads = existingDownload[0].remaining_downloads
        if (existingDownload[0].expires_at && new Date(existingDownload[0].expires_at) < new Date()) {
          return res.status(403).json({ message: "Download has expired." })
        }
        if (existingDownload[0].remaining_downloads <= 0) {
          return res.status(403).json({ message: "Download limit reached." })
        }
      }
    } else {
      return res.status(400).json({ message: "Missing order_id parameter." })
    }

    if (!storageKey) {
      return res.status(404).json({ message: "File not found." })
    }

    // Resolve file from local storage
    // storageKey format: "digital/asset_xxx.ext"
    const fileNameFromKey = storageKey.replace("digital/", "")
    const filePath = path.join(STORAGE_DIR, fileNameFromKey)

    if (!fs.existsSync(filePath)) {
      console.error(`[Download] File not found at: ${filePath}`)
      return res.status(404).json({ message: "The requested file is no longer available on the server." })
    }

    const stat = fs.statSync(filePath)

    // Update download tracking BEFORE streaming to prevent race conditions
    try {
      if (downloadRecordId) {
        await digitalAssetService.updateDigitalOrderDownloads({
          id: downloadRecordId,
          remaining_downloads: Math.max(0, remainingDownloads - 1),
          download_count: 1,
          last_downloaded_at: new Date(),
        })
      } else if (orderId) {
        // Legacy: create a download record on first download
        const { data: orders } = (await query.graph({
          entity: "order",
          fields: ["id", "customer_id", "items.*"],
          filters: { id: orderId },
        })) as any
        const order = orders?.[0] as any
        if (order) {
          const items: any[] = order.items || []
          const digitalItem = items.find((item: any) => {
            const meta = item.metadata || {}
            return meta.is_digital === true || meta.is_digital === "true"
          })
          if (digitalItem) {
            const itemMeta = digitalItem.metadata || {}
            await digitalAssetService.createDigitalOrderDownloads({
              order_id: orderId,
              line_item_id: digitalItem.id,
              product_id: digitalItem.product_id,
              customer_id: customerId,
              digital_asset_id: null,
              remaining_downloads: Math.max(0, (Number(itemMeta.download_limit) || 5) - 1),
              download_count: 1,
              expires_at: itemMeta.expires_at ? new Date(itemMeta.expires_at) : null,
              is_active: true,
              metadata: {
                title: digitalItem.title,
                is_digital: true,
                version: itemMeta.version || "1.0.0",
                file_name: fileName,
                mime_type: mimeType,
                file_size: fileSize,
                storage_key: storageKey,
              },
            })
          }
        }
      }
    } catch (updateErr) {
      console.error("[Download] Failed to update download record:", updateErr)
      // Don't block the download for tracking errors
    }

    // Stream the file to the client using a ReadStream for memory efficiency
    const readStream = fs.createReadStream(filePath)

    res.setHeader("Content-Type", mimeType)
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)
    res.setHeader("Content-Length", stat.size)
    res.setHeader("X-Remaining-Downloads", String(Math.max(0, remainingDownloads - 1)))
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate")
    res.setHeader("Pragma", "no-cache")
    res.setHeader("Expires", "0")

    // Pipe the file stream to the response
    readStream.pipe(res)

    // Handle client disconnect: abort the read stream to prevent resource leaks
    res.on("close", () => {
      readStream.destroy()
    })

    // Handle stream errors gracefully — destroy the stream to release resources
    readStream.on("error", (streamErr) => {
      console.error("[Download] Stream error:", streamErr)
      readStream.destroy()
      if (!res.headersSent) {
        return res.status(500).json({ message: "Failed to stream download file." })
      }
      res.end()
    })
  } catch (error: any) {
    if (
      MedusaError.Types &&
      (error.type === MedusaError.Types.NOT_FOUND ||
        error.message?.includes("not found"))
    ) {
      return res.status(404).json({ message: "Download not found." })
    }
    console.error("[Download] Error:", error)
    if (!res.headersSent) {
      return res.status(500).json({ message: "Failed to process download." })
    }
  }
}