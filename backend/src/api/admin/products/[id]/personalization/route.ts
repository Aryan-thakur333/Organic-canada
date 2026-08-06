import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PERSONALIZATION_MODULE } from "../../../../../modules/personalization"
import { normalizePersonalizationError } from "../../../../../modules/personalization/errors"
import { getTemplateLifecycleStatus } from "../../../../../modules/personalization/utils/template-validation"

function newestFirst(left: any, right: any) {
  return new Date(right.updated_at || right.created_at || 0).getTime() -
    new Date(left.updated_at || left.created_at || 0).getTime()
}

function decorate(template: any) {
  if (!template) return null
  const lifecycleStatus = getTemplateLifecycleStatus(template)
  return {
    ...template,
    status: lifecycleStatus.toUpperCase(),
    lifecycle_status: lifecycleStatus,
    assignment_scope: template.variant_id ? "VARIANT" : "PRODUCT",
    field_count: (template.fields || []).length,
    fields: template.fields || [],
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const templates = await service.listTemplatesWithFields(
      { product_id: req.params.id } as any,
      { order: { updated_at: "DESC" }, take: 100 }
    )
    const ordered = (templates || []).slice().sort(newestFirst)
    const active = ordered.filter(
      (template: any) =>
        template.is_active === true && getTemplateLifecycleStatus(template) !== "archived"
    )
    const activeByAssignment = new Map<string, any[]>()
    for (const template of active) {
      const assignment = template.variant_id || "__product__"
      activeByAssignment.set(
        assignment,
        [...(activeByAssignment.get(assignment) || []), template]
      )
    }
    const ambiguous = Array.from(activeByAssignment.entries()).filter(
      ([, assigned]) => assigned.length > 1
    )
    if (ambiguous.length) {
      return res.status(409).json({
        code: "PERSONALIZATION_TEMPLATE_AMBIGUOUS",
        message: "This product has conflicting active personalization template assignments.",
        details: {
          assignments: ambiguous.map(([assignment, assigned]) => ({
            scope: assignment === "__product__" ? "PRODUCT" : "VARIANT",
            variant_id: assignment === "__product__" ? null : assignment,
            template_ids: assigned.map((template: any) => template.id),
          })),
        },
      })
    }

    const productLevelActive = active.find((template: any) => !template.variant_id) || null
    const activeTemplate = productLevelActive || active[0] || null
    const draftTemplate = ordered.find(
      (template: any) => getTemplateLifecycleStatus(template) === "draft"
    ) || null
    // An administrator should resume the latest draft when one exists. Otherwise
    // show the deterministic product-level active assignment, then the latest
    // variant assignment, and finally the latest archived history row.
    const editableTemplate = draftTemplate || activeTemplate || ordered[0] || null

    return res.status(200).json({
      personalization_enabled: active.length > 0,
      template: decorate(editableTemplate),
      active_template: decorate(activeTemplate),
      draft_template: decorate(draftTemplate),
      template_count: ordered.length,
      active_template_count: active.length,
    })
  } catch (error: any) {
    const normalized = normalizePersonalizationError(
      error,
      "PRODUCT_PERSONALIZATION_QUERY_FAILED",
      "Unable to load product personalization."
    )
    return res.status(normalized.status).json(normalized.body)
  }
}
