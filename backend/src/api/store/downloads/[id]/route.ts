import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, MedusaError } from "@medusajs/framework/utils"
import { DIGITAL_ASSET_MODULE } from "../../../../modules/digital-asset"

// ── Order verification statuses that grant download access ─────────────────
const GRANTED_ORDER_STATUSES = ["fulfilled", "completed", "partially_fulfilled"]
const GRANTED_PAYMENT_STATUSES = ["captured", "partially_refunded"]

/**
 * GET /store/downloads/:id
 *
 * Authenticates the customer, verifies they have a completed/paid order
 * containing the product associated with the DigitalAsset, then returns
 * a presigned S3 download URL that expires in 15 minutes.
 *
 * Flow:
 *   1. Extract customer_id from auth_context (401 if missing)
 *   2. Resolve DigitalAsset by ID (404 if not found)
 *   3. Resolve the product_id from the DigitalAsset (404 if unlinked)
 *   4. Query orders for this customer that include that product_id
 *      and have a completed/fulfilled status with captured payment
 *   5. If no qualifying order found → 403 Forbidden
 *   6. Check download_limit: if exceeded → 403 Forbidden
 *   7. Generate presigned S3 URL via the file service provider
 *   8. Increment download_count on the DigitalAsset
 *   9. Return the presigned URL to the client
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  // ── 1. Authenticate ─────────────────────────────────────────────────────
  const customerId = (req as any).auth_context?.actor_id as string | undefined
  if (!customerId) {
    return res.status(401).json({
      message: "Authentication required. Please log in to download digital assets.",
    })
  }

  try {
    // ── 2. Resolve DigitalAsset ────────────────────────────────────────────
    const digitalAssetService: any = req.scope.resolve(DIGITAL_ASSET_MODULE)
    const asset = await digitalAssetService.retrieveDigitalAsset(id)

    if (!asset) {
      return res.status(404).json({
        message: "Digital asset not found.",
      })
    }

    if (!asset.is_active) {
      return res.status(403).json({
        message: "This digital asset is no longer available for download.",
      })
    }

    if (!asset.product_id) {
      return res.status(404).json({
        message: "Digital asset is not linked to any product.",
      })
    }

    // ── 3. Check download limit ────────────────────────────────────────────
    if (asset.download_limit > 0 && asset.download_count >= asset.download_limit) {
      return res.status(403).json({
        message: `Download limit reached (${asset.download_limit}/${asset.download_limit}). Contact support for assistance.`,
        download_count: asset.download_count,
        download_limit: asset.download_limit,
      })
    }

    // ── 4. Query orders for completed purchase ─────────────────────────────
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "status",
        "payment_status",
        "fulfillment_status",
        "customer_id",
        "items.product_id",
      ],
      filters: {
        customer_id: customerId,
      },
    })

    const qualifyingOrder = (orders || []).find((order: any) => {
      // Order must belong to this customer
      if (order.customer_id !== customerId) return false

      // Order must have a granted fulfillment status
      const fulfillmentOk = GRANTED_ORDER_STATUSES.includes(order.fulfillment_status || order.status || "")
      if (!fulfillmentOk) return false

      // Payment must be captured or partially refunded
      const paymentOk = GRANTED_PAYMENT_STATUSES.includes(order.payment_status || "")
      if (!paymentOk) return false

      // Order must contain a line item matching the asset's product_id
      const hasProduct = (order.items || []).some(
        (item: any) => item.product_id === asset.product_id
      )
      return hasProduct
    })

    if (!qualifyingOrder) {
      return res.status(403).json({
        message:
          "Purchase required. You must complete a verified order for this product before downloading.",
      })
    }

    // ── 5. Generate presigned download URL via registered file service ──────
    const fileService: any = req.scope.resolve("fileService")
    if (!fileService || typeof fileService.getPresignedDownloadUrl !== "function") {
      return res.status(503).json({
        message: "Download service is temporarily unavailable. Please contact support.",
      })
    }

    const presignedUrl = await fileService.getPresignedDownloadUrl({
      fileKey: asset.secure_s3_key,
      expiresIn: 900,
    })

    // Increment download count
    await digitalAssetService.updateDigitalAssets({
      id: asset.id,
      download_count: asset.download_count + 1,
    })

    return res.json({
      url: presignedUrl,
      expires_in: 900,
      file_name: asset.file_name,
      mime_type: asset.mime_type,
      download_count: asset.download_count + 1,
    })
  } catch (error: any) {
    // Handle not-found errors from retrieveDigitalAsset
    if (
      error.type === MedusaError.Types.NOT_FOUND ||
      error.message?.includes("not found")
    ) {
      return res.status(404).json({ message: "Digital asset not found." })
    }

    console.error("[Download] Failed to generate download URL:", error)
    return res.status(500).json({
      message: "Failed to generate download URL. Please try again later.",
    })
  }
}
