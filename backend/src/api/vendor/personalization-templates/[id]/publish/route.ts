import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../../modules/personalization"
import crypto from "crypto"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const personalizationService: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const vendorId = (req as any).vendor?.id
    const templateId = req.params.id

    if (!vendorId) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const existing = await personalizationService.getTemplateWithFields(templateId)
    
    if (!existing || existing.vendor_id !== vendorId) {
      return res.status(403).json({
        code: "PERSONALIZATION_FORBIDDEN",
        message: "You cannot manage personalization settings for this product.",
      })
    }
    
    const fields = existing.fields || []
    if (fields.length === 0) {
      return res.status(422).json({
        code: "PERSONALIZATION_TEMPLATE_EMPTY",
        message: "Cannot publish a template without fields.",
      })
    }
    
    await personalizationService.publishTemplate(templateId)

    const published = await personalizationService.getTemplateWithFields(templateId)

    return res.status(200).json({ template: { ...published, fields: published.fields || [] } })
  } catch (error: any) {
    // Domain errors expose their machine-readable code on `error.code`; the
    // legacy message-only checks no longer fire now that validation throws
    // PersonalizationDomainError instances.
    if (error?.code === "PERSONALIZATION_FIELD_KEY_DUPLICATE" || error.message === "PERSONALIZATION_FIELD_KEY_DUPLICATE") {
      return res.status(409).json({
        code: "PERSONALIZATION_TEMPLATE_CONFLICT",
        message: "Duplicate field key found in template."
      })
    }
    if (error?.code === "PERSONALIZATION_TEMPLATE_FIELDS_REQUIRED" || error.message === "PERSONALIZATION_TEMPLATE_NO_FIELDS") {
      return res.status(422).json({
        code: "PERSONALIZATION_TEMPLATE_EMPTY",
        message: "Cannot publish a template without fields.",
      })
    }
    if (error?.code === "PERSONALIZATION_TEMPLATE_NOT_FOUND" || error.message?.includes("was not found")) {
      return res.status(404).json({ code: "PERSONALIZATION_TEMPLATE_NOT_FOUND", message: "Template not found" })
    }
    return res.status(500).json({
      message: error.message || "Failed to publish personalization template",
    })
  }
}
