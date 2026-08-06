import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { DIGITAL_ASSET_MODULE } from "../../../../modules/digital-asset"
import path from "path"
import fs from "fs"

const STORAGE_DIR = path.join(process.cwd(), "uploads", "digital")

function storageKeyToDiskFileName(storageKey: string): string {
  const normalized = String(storageKey || "").replace(/\\/g, "/").trim()
  return path.basename(normalized)
}

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

    let orderLookupId: string
    let storageKey: string | null = null
    let fileName: string = "download"
    let mimeType: string = "application/octet-stream"
    let fileSize: number = 0
    let remainingDownloads: number = 0
    let downloadRecordId: string | null = null
    let downloadRecord: any = null
    let order: any = null

    const denyLog = (reason: string, details?: any) => {
      console.error("[Digital Download Denied]", {
        reason,
        downloadId: downloadRecord?.id || id,
        customerId,
        download_customer_id: downloadRecord?.customer_id,
        order_id: downloadRecord?.order_id || orderLookupId,
        status: downloadRecord?.status,
        is_paid: downloadRecord?.is_paid,
        is_active: downloadRecord?.is_active,
        remaining_downloads: downloadRecord?.remaining_downloads,
        order_payment_status: order?.payment_status,
        order_status: order?.status,
        file_path: details?.file_path,
        storage_key: storageKey || details?.storage_key,
      })
    }

    const isOrderDownload = id.startsWith("dld_")

    if (isOrderDownload) {
      downloadRecord = await digitalAssetService.retrieveDigitalOrderDownload(id).catch(() => null)
      if (!downloadRecord) {
        return res.status(404).json({ message: "Download record not found." })
      }

      orderLookupId = downloadRecord.order_id
      downloadRecordId = downloadRecord.id
      remainingDownloads = downloadRecord.remaining_downloads

      // Fetch order to verify payment
      const { data: orders } = (await query.graph({
        entity: "order",
        fields: [
          "id", "status", "payment_status", "customer_id",
          "payment_collections.payments.id",
          "payment_collections.payments.status",
          "payment_collections.payments.amount",
          "payment_collections.payments.captured_at",
          "payment_collections.payments.provider_id",
          "payment_collections.payments.payment_session.data"
        ],
        filters: { id: orderLookupId },
      })) as any
      order = orders?.[0] as any

      if (!order) {
        return res.status(404).json({ message: "Associated order not found." })
      }

      if (downloadRecord.customer_id !== customerId) {
        denyLog("CUSTOMER_MISMATCH")
        return res.status(403).json({ message: "This download does not belong to you." })
      }

      if (!downloadRecord.is_active) {
        denyLog("DOWNLOAD_NOT_ACTIVE")
        return res.status(403).json({ message: "This download is no longer available." })
      }

      if (downloadRecord.expires_at && new Date(downloadRecord.expires_at) < new Date()) {
        denyLog("DOWNLOAD_EXPIRED")
        return res.status(403).json({
          message: `Download expired on ${new Date(downloadRecord.expires_at).toLocaleDateString()}.`,
        })
      }

      if (downloadRecord.remaining_downloads <= 0) {
        denyLog("DOWNLOAD_LIMIT_REACHED")
        return res.status(403).json({
          message: "Download limit reached.",
          remaining_downloads: 0,
        })
      }

      const recordMeta = downloadRecord.metadata || {}
      storageKey = recordMeta.storage_key as string | undefined || null
      fileName = recordMeta.file_name as string || "download"
      mimeType = recordMeta.mime_type as string || "application/octet-stream"
      fileSize = Number(recordMeta.file_size) || 0

      if (!storageKey && downloadRecord.digital_asset_id) {
        try {
          const asset = await digitalAssetService.retrieveDigitalAsset(downloadRecord.digital_asset_id)
          if (asset) {
            storageKey = asset.secure_s3_key || asset.storage_key
            fileName = asset.file_name || fileName
            mimeType = asset.mime_type || mimeType
            fileSize = asset.file_size || fileSize
          }
        } catch {
          // fallback
        }
      }

      let isPaid = ["captured", "partially_refunded", "paid"].includes(order.payment_status || "")
      if (!isPaid) {
        if (order.status === "paid") {
          isPaid = true
        } else {
          const collections = Array.isArray(order.payment_collections) ? order.payment_collections : []
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

      if (!isPaid) {
        denyLog("PAYMENT_NOT_CAPTURED")
        return res.status(403).json({ message: "Payment must be captured/paid before downloading." })
      }
    } else if (orderId) {
      orderLookupId = orderId

      const { data: orders } = (await query.graph({
        entity: "order",
        fields: [
          "id", "status", "payment_status", "customer_id", "items.*",
          "payment_collections.payments.id",
          "payment_collections.payments.status",
          "payment_collections.payments.amount",
          "payment_collections.payments.captured_at",
          "payment_collections.payments.provider_id",
          "payment_collections.payments.payment_session.data"
        ],
        filters: { id: orderLookupId },
      })) as any
      order = orders?.[0] as any
      
      if (!order) {
        return res.status(404).json({ message: "Order not found." })
      }
      if (order.customer_id !== customerId) {
        denyLog("CUSTOMER_MISMATCH")
        return res.status(403).json({ message: "This order does not belong to you." })
      }

      let isPaid = ["captured", "paid", "partially_refunded"].includes(order.payment_status || "")
      if (!isPaid) {
        if (order.status === "paid") {
          isPaid = true
        } else {
          const collections = Array.isArray(order.payment_collections) ? order.payment_collections : []
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

      if (!isPaid) {
        denyLog("PAYMENT_NOT_CAPTURED")
        return res.status(403).json({ message: "Payment must be captured/paid before downloading." })
      }

      const items: any[] = order.items || []
      const digitalItem = items.find((item: any) => {
        const meta = item.metadata || {}
        return meta.is_digital === true || meta.is_digital === "true"
      })

      if (!digitalItem) {
        return res.status(404).json({ message: "No digital items found in this order." })
      }

      const itemMeta = digitalItem.metadata || {}
      const assets = itemMeta.download_assets || []
      const matchedAsset = assets.find((a: any) => a.id === id || a.id === `asset_${id}`)

      if (matchedAsset?.storage_key) {
        storageKey = matchedAsset.storage_key
        fileName = matchedAsset.filename || "download"
        mimeType = matchedAsset.mime_type || "application/octet-stream"
        fileSize = matchedAsset.size || 0
      } else {
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

      const existingDownload = await digitalAssetService.listDigitalOrderDownloads(
        { order_id: orderLookupId, product_id: digitalItem.product_id, customer_id: customerId },
        { take: 1 }
      )
      if (existingDownload?.length > 0) {
        downloadRecord = existingDownload[0]
        downloadRecordId = existingDownload[0].id
        remainingDownloads = existingDownload[0].remaining_downloads
        if (existingDownload[0].expires_at && new Date(existingDownload[0].expires_at) < new Date()) {
          denyLog("DOWNLOAD_EXPIRED")
          return res.status(403).json({ message: "Download has expired." })
        }
        if (existingDownload[0].remaining_downloads <= 0) {
          denyLog("DOWNLOAD_LIMIT_REACHED")
          return res.status(403).json({ message: "Download limit reached." })
        }
      }
    } else {
      return res.status(400).json({ message: "Missing order_id parameter." })
    }

    if (!storageKey) {
      denyLog("FILE_NOT_FOUND", { message: "storageKey is missing" })
      return res.status(404).json({ message: "File not found." })
    }

    const fileNameFromKey = storageKeyToDiskFileName(storageKey)
    if (!fileNameFromKey) {
      denyLog("FILE_NOT_FOUND", { message: "fileNameFromKey is empty" })
      return res.status(404).json({ message: "File not found." })
    }

    const filePath = path.join(STORAGE_DIR, fileNameFromKey)
    const resolvedStorageDir = path.resolve(STORAGE_DIR)
    const resolvedFilePath = path.resolve(filePath)

    if (!resolvedFilePath.startsWith(resolvedStorageDir + path.sep)) {
      denyLog("INVALID_PATH", { file_path: resolvedFilePath })
      return res.status(400).json({ message: "Invalid digital asset path." })
    }

    if (!fs.existsSync(resolvedFilePath)) {
      denyLog("FILE_NOT_FOUND_ON_DISK", { file_path: resolvedFilePath })
      return res.status(404).json({ message: "The requested file is no longer available on the server." })
    }

    const stat = fs.statSync(resolvedFilePath)

    try {
      if (downloadRecordId) {
        await digitalAssetService.updateDigitalOrderDownloads({
          id: downloadRecordId,
          remaining_downloads: Math.max(0, remainingDownloads - 1),
          download_count: Number(downloadRecord?.download_count || 0) + 1,
          last_downloaded_at: new Date(),
        })
      } else if (orderId) {
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
            const entitlementLimit = Number(itemMeta.download_limit) || 5
            remainingDownloads = entitlementLimit
            await digitalAssetService.createDigitalOrderDownloads({
              order_id: orderId,
              line_item_id: digitalItem.id,
              product_id: digitalItem.product_id,
              customer_id: customerId,
              digital_asset_id: null,
              remaining_downloads: Math.max(0, entitlementLimit - 1),
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
    }

    const readStream = fs.createReadStream(resolvedFilePath)

    res.setHeader("Content-Type", mimeType)
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)
    res.setHeader("Content-Length", stat.size)
    res.setHeader("X-Remaining-Downloads", String(Math.max(0, remainingDownloads - 1)))
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate")
    res.setHeader("Pragma", "no-cache")
    res.setHeader("Expires", "0")

    readStream.pipe(res)

    res.on("close", () => {
      readStream.destroy()
    })

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
