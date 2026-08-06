// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { DIGITAL_ASSET_MODULE } from "../../../../../modules/digital-asset"

/**
 * POST /store/downloads/:id/regenerate
 *
 * Regenerates a download link by resetting the remaining_downloads
 * for a digital order download record. Only works if the customer
 * owns the order and the download hasn't permanently expired.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required." })
  }

  const { id } = req.params

  try {
    const digitalAssetService: any = req.scope.resolve(DIGITAL_ASSET_MODULE)
    const download = await digitalAssetService.retrieveDigitalOrderDownload(id)

    if (!download) {
      return res.status(404).json({ message: "Download record not found." })
    }

    if (download.customer_id !== customerId) {
      return res.status(403).json({ message: "This download does not belong to you." })
    }

    // Check permanent expiry
    if (download.expires_at && new Date(download.expires_at) < new Date()) {
      return res.status(403).json({
        message: "This download has permanently expired. Please contact support.",
      })
    }

    const metadata = download.metadata || {}
    let originalLimit = Number(metadata.download_limit) || 0

    if (download.digital_asset_id) {
      const asset = await digitalAssetService.retrieveDigitalAsset(download.digital_asset_id).catch(() => null)
      originalLimit = Number(asset?.download_limit) || originalLimit
    }

    // Reset remaining downloads to the original entitlement limit, capped to the storefront default.
    const newRemaining = Math.max(1, Math.min(originalLimit || 3, 5))

    await digitalAssetService.updateDigitalOrderDownloads({
      id: download.id,
      remaining_downloads: newRemaining,
      download_count: 0,
      last_downloaded_at: null,
    })

    return res.json({
      message: "Download link regenerated successfully.",
      remaining_downloads: newRemaining,
    })
  } catch (error: any) {
    if (error.type === MedusaError.Types.NOT_FOUND || error.message?.includes("not found")) {
      return res.status(404).json({ message: "Download record not found." })
    }
    console.error("[Download] Regenerate error:", error)
    return res.status(500).json({ message: "Failed to regenerate download link." })
  }
}
