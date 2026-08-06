import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { PERSONALIZATION_MODULE } from "../../../../../modules/personalization"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerId = (req as any).auth_context?.actor_id
    if (!customerId) return res.status(401).json({ message: "Authentication required" })
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const asset = await service.retrievePersonalizationAsset(req.params.id)
    if (!asset || asset.owner_customer_id !== customerId) return res.status(404).json({ message: "Upload not found" })
    const fileService: any = req.scope.resolve(Modules.FILE)
    const buffer = await fileService.getAsBuffer(asset.file_id)
    res.setHeader("Content-Type", asset.mime_type || "application/octet-stream")
    res.setHeader("Cache-Control", "private, no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")
    return res.status(200).send(buffer)
  } catch {
    return res.status(404).json({ message: "Upload not found" })
  }
}
