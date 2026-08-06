import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../../modules/personalization"
import {
  normalizePersonalizationError,
  personalizationError,
} from "../../../../../modules/personalization/errors"

/** Archive disables storefront resolution while preserving all historical snapshots. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const current = await service.retrievePersonalizationTemplate(req.params.id)
    const expectedVersion = (req.body as any)?.expected_version
    if (
      expectedVersion !== undefined &&
      Number(expectedVersion) !== Math.max(1, Number(current.version) || 1)
    ) {
      personalizationError(
        "PERSONALIZATION_VERSION_CONFLICT",
        "This template was changed by another administrator. Reload it before archiving.",
        409,
        {
          expected_version: Number(expectedVersion),
          current_version: Math.max(1, Number(current.version) || 1),
        }
      )
    }
    const template = await service.archiveTemplate(req.params.id)
    return res.status(200).json({
      id: template.id,
      archived: true,
      template: {
        ...template,
        status: "ARCHIVED",
        lifecycle_status: "archived",
        assignment_scope: template.variant_id ? "VARIANT" : "PRODUCT",
        field_count: (template.fields || []).length,
      },
    })
  } catch (error: any) {
    const normalized = normalizePersonalizationError(
      error,
      "PERSONALIZATION_TEMPLATE_ARCHIVE_FAILED",
      "Unable to archive personalization template."
    )
    return res.status(normalized.status).json(normalized.body)
  }
}
