import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BUNDLE_MODULE } from "../../../../../modules/bundle"

/** Idempotent lifecycle endpoint used by Admin extensions and API clients. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(BUNDLE_MODULE)
    const bundle = await service.retrieveBundleDefinition(req.params.id)
    if (bundle.status !== "archived") {
      await service.updateBundleDefinitions({ id: bundle.id, status: "archived" })
    }
    return res.status(200).json({ id: bundle.id, archived: true })
  } catch {
    return res.status(404).json({ message: "Bundle not found" })
  }
}
