import crypto from "crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { PERSONALIZATION_MODULE } from "../../../../modules/personalization"
import { decodeImageDimensions, PERSONALIZATION_IMAGE_MAX_BYTES, PERSONALIZATION_IMAGE_TYPES, validateImageFilename } from "../../../../modules/personalization/utils/image-security"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerId = (req as any).auth_context?.actor_id
    if (!customerId) return res.status(401).json({ message: "Authentication required" })
    const { template_id, field_id, filename, mime_type, content_base64 } = req.body as any
    if (!template_id || !field_id || !filename || !mime_type || !content_base64) return res.status(400).json({ message: "template_id, field_id, filename, mime_type, and content_base64 are required" })
    const cleanName = validateImageFilename(filename, mime_type)
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content_base64)) throw new Error("Invalid base64 image content")
    const buffer = Buffer.from(content_base64, "base64")
    if (!buffer.length || buffer.length > PERSONALIZATION_IMAGE_MAX_BYTES) throw new Error("Image must be no larger than 5 MB")
    const dimensions = await decodeImageDimensions(buffer, mime_type)
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const template = await service.getTemplateWithFields(template_id)
    const field = (template.fields || []).find((item: any) => item.id === field_id && item.field_type === "image_upload")
    if (!template.is_active || !field) return res.status(422).json({ message: "Active image upload field not found" })
    const extension = PERSONALIZATION_IMAGE_TYPES[mime_type as keyof typeof PERSONALIZATION_IMAGE_TYPES]
    const fileService: any = req.scope.resolve(Modules.FILE)
    const file = await fileService.createFiles({
      filename: `personalizations/${crypto.randomUUID()}${extension}`,
      mimeType: mime_type,
      content: buffer.toString("base64"),
      access: "private",
    })
    const asset = await service.createPersonalizationAssets({
      template_id, field_id, owner_customer_id: customerId, file_id: file.id, type: "image", status: "uploaded",
      url: null, path: null, size_bytes: buffer.length, mime_type, original_filename: cleanName,
      width: dimensions.width, height: dimensions.height,
    })
    return res.status(201).json({ upload_id: asset.id, mime_type, size_bytes: buffer.length, ...dimensions, preview_url: `/store/personalizations/uploads/${asset.id}` })
  } catch (error: any) {
    return res.status(422).json({ code: "PERSONALIZATION_UPLOAD_INVALID", message: error.message || "Upload failed" })
  }
}
