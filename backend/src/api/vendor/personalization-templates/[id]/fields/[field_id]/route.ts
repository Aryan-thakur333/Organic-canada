import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../../../modules/personalization"
import { validateFieldConfiguration } from "../../../../../../modules/personalization/utils/field-configuration"

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  try {
    const personalizationService: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const vendorId = (req as any).vendor?.id
    const templateId = req.params.id
    const fieldId = req.params.field_id
    const body = req.body as any

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

    const field = existing.fields?.find((f: any) => f.id === fieldId)
    if (!field) {
      return res.status(404).json({ code: "PERSONALIZATION_FIELD_NOT_FOUND", message: "Field not found in this template" })
    }

    const updateData: any = { id: fieldId }
    if (body.key !== undefined) updateData.key = body.key
    if (body.label !== undefined) updateData.label = body.label
    if (body.field_type !== undefined) updateData.field_type = body.field_type
    if (body.is_required !== undefined) updateData.is_required = body.is_required
    if (body.min_length !== undefined) updateData.min_length = body.min_length
    if (body.max_length !== undefined) updateData.max_length = body.max_length
    if (body.min_value !== undefined) updateData.min_value = body.min_value
    if (body.max_value !== undefined) updateData.max_value = body.max_value
    if (body.allowed_values !== undefined) updateData.allowed_values = body.allowed_values
    if (body.placeholder !== undefined) updateData.placeholder = body.placeholder
    if (body.help_text !== undefined) updateData.help_text = body.help_text
    if (body.price_adjustment !== undefined) updateData.price_adjustment = body.price_adjustment
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order
    if (existing.fields?.some((candidate: any) => candidate.id !== fieldId && candidate.key === (updateData.key ?? field.key))) {
      return res.status(409).json({ message: "Field keys must be unique" })
    }
    validateFieldConfiguration({ ...field, ...updateData })
    
    // We should unpublish on structural changes
    await personalizationService.updatePersonalizationTemplates({ id: templateId, is_active: false })
    
    await personalizationService.updatePersonalizationFields(updateData)
    
    const updated = await personalizationService.retrievePersonalizationField(fieldId)

    return res.status(200).json({ field: updated })
  } catch (error: any) {
    if (error.message?.includes("was not found")) {
      return res.status(404).json({ code: "PERSONALIZATION_FIELD_NOT_FOUND", message: "Field not found" })
    }
    return res.status(422).json({
      message: error.message || "Failed to update personalization field",
    })
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  try {
    const personalizationService: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const vendorId = (req as any).vendor?.id
    const templateId = req.params.id
    const fieldId = req.params.field_id

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

    const field = existing.fields?.find((f: any) => f.id === fieldId)
    if (!field) {
      return res.status(200).json({ success: true }) // idempotent
    }

    await personalizationService.updatePersonalizationTemplates({ id: templateId, is_active: false })
    await personalizationService.deletePersonalizationFields(fieldId)

    return res.status(200).json({ success: true, message: "Field deleted" })
  } catch (error: any) {
    if (error.message?.includes("was not found")) {
      return res.status(200).json({ success: true })
    }
    return res.status(500).json({
      message: error.message || "Failed to delete personalization field",
    })
  }
}
