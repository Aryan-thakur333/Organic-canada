// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { DIGITAL_ASSET_MODULE } from "../../../../../modules/digital-asset"

const EXPIRY_SECONDS = 60

/**
 * GET /store/downloads/generate-link/:variant_id
 *
 * Secure Presigned Link Generator
 *
 * 1. Verifies the authenticated customer has a paid/completed order
 *    containing a line item whose variant mapping includes digital_asset_key metadata.
 * 2. Returns a short-lived URL that can be used to download the digital asset.
 *
 * Response:
 * {
 *   download_url: "https://cdn.example.com/digital/asset_xxx.pdf?X-Amz-Expires=60&..."
 *   expires_in: 60
 * }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required." })
  }

  const { variant_id } = req.params
  if (!variant_id) {
    return res.status(400).json({ message: "variant_id is required." })
  }

  try {
    const digitalAssetService: any = req.scope.resolve(DIGITAL_ASSET_MODULE)
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // ── 1. Find completed/paid orders for this customer ──
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "payment_status",
        "status",
        "customer_id",
        "items.variant_id",
        "items.metadata",
      ],
      filters: {
        customer_id: customerId,
        payment_status: ["captured", "paid", "partially_refunded"],
      },
    })

    const validOrders = (orders || []).filter((o: any) =>
      ["captured", "paid", "partially_refunded"].includes(o.payment_status || "")
    )

    if (!validOrders.length) {
      return res.status(403).json({ message: "No eligible paid orders found." })
    }

    // ── 2. Locate the line item with matching variant that contains digital_asset_key ──
    let matchedItem: any = null
    let matchedOrder: any = null

    for (const order of validOrders) {
      const item = (order.items || []).find((it: any) => {
        const meta = it.metadata || {}
        const assetKey = meta.digital_asset_key
        return it.variant_id === variant_id && Boolean(assetKey)
      })
      if (item) {
        matchedItem = item
        matchedOrder = order
        break
      }
    }

    if (!matchedItem || !matchedOrder) {
      return res.status(403).json({
        message: "You have not purchased this digital item or it is not available.",
      })
    }

    // ── 3. Retrieve the digital asset metadata ──
    const itemMeta = matchedItem.metadata || {}
    const assetKey = itemMeta.digital_asset_key as string | undefined

    if (!assetKey) {
      return res.status(403).json({ message: "Invalid digital asset reference." })
    }

    // Try to resolve storage information from:
    // a) metadata on the item
    // b) product metadata via query
    let storageKey: string | null = itemMeta.storage_key || null
    let fileName: string = itemMeta.file_name || "download"
    let mimeType: string = itemMeta.mime_type || "application/octet-stream"

    if (!storageKey) {
      try {
        const { data: products } = await query.graph({
          entity: "product",
          fields: ["id", "metadata"],
          filters: { id: matchedItem.product_id },
        })
        const product = products?.[0]
        const productMeta = product?.metadata || {}
        const assets = productMeta.download_assets || []
        const matchedAsset = assets.find((a: any) => a.id === assetKey || a.key === assetKey)
        if (matchedAsset) {
          storageKey = matchedAsset.storage_key || null
          fileName = matchedAsset.file_name || fileName
          mimeType = matchedAsset.mime_type || mimeType
        }
      } catch {
        // Ignore product lookup failures and continue to fallback
      }
    }

    // Fallback: fetch asset directly by key lookup (service resolves storage)
    if (!storageKey) {
      try {
        const assets = await digitalAssetService.listDigitalAssets(
          { id: assetKey },
          { select: ["id", "secure_s3_key", "file_name", "mime_type", "file_size"], take: 1 }
        )
        const asset = assets?.[0]
        if (asset) {
          storageKey = asset.secure_s3_key || null
          fileName = asset.file_name || fileName
          mimeType = asset.mime_type || mimeType
        }
      } catch {
        // ignore and fallthrough to error below
      }
    }

    if (!storageKey) {
      return res.status(404).json({ message: "Digital asset file reference not found." })
    }

    // ── 4. Generate a short-lived Presigned URL ──
    // Strategy: Use Medusa's local file service first; otherwise construct a URL.
    // We deliberately do NOT expose the underlying raw storage path or bucket details.
    const presignedUrl = await generatePresignedDownloadUrl(req, storageKey, EXPIRY_SECONDS)

    return res.json({
      download_url: presignedUrl,
      expires_in: EXPIRY_SECONDS,
      file_name: fileName,
      mime_type: mimeType,
    })
  } catch (error: any) {
    if (
      error.type === MedusaError.Types.NOT_FOUND ||
      error.message?.includes("not found")
    ) {
      return res.status(404).json({ message: "Resource not found." })
    }
    console.error("[Download] generate-link error:", error)
    return res.status(500).json({ message: "Failed to generate download link." })
  }
}

/**
 * Attempts to generate a long-lived presigned URL.
 * Tries (in order):
 * 1) A file provider with `getPresignedDownloadUrl`/`getFileUploadURL` API
 * 2) `req.scope.resolve(ContainerRegistrationKeys.FILE)` style service
 * 3) Fallback: route-local presigned endpoint using the storageKey
 */
async function generatePresignedDownloadUrl(
  req: MedusaRequest,
  storageKey: string,
  expiresIn: number
): Promise<string> {
  const scope = (req as any).scope

  // 1. Resolve file provider by common identifiers
  const providerKeys = [
    "fileProvider",
    "fileService",
    "fileManager",
    "fileManagerProvider",
  ]

  for (const key of providerKeys) {
    try {
      const fileService = scope.resolve(key)
      if (typeof fileService?.getPresignedDownloadUrl === "function") {
        return await fileService.getPresignedDownloadUrl(storageKey, expiresIn)
      }
      if (typeof fileService?.getFileUploadURL === "function") {
        // Some providers re-use upload URL helper for private files
        return await fileService.getFileUploadURL(storageKey, expiresIn)
      }
    } catch {
      // continue to next attempts
    }
  }

  // 2. Attempt ContainerRegistrationKeys.FILE (medusa 2.x alias)
  try {
    const fileService = scope.resolve(ContainerRegistrationKeys.FILE)
    if (typeof fileService?.getPresignedDownloadUrl === "function") {
      return await fileService.getPresignedDownloadUrl(storageKey, expiresIn)
    }
  } catch {
    // ignore
  }

  // 3. No file provider is configured for presigned URL generation.
  //    Throw a clear error so the caller returns an actionable message
  //    instead of constructing a URL to a non-existent route.
  //    The frontend should use the /store/downloads/:id direct streaming endpoint.
  throw new Error(
    `No file provider with getPresignedDownloadUrl configured. ` +
    `Install a file provider (e.g. @medusajs/file-s3) for presigned URL support, ` +
    `or use the /store/downloads/:id endpoint for direct streaming downloads.`
  )
}