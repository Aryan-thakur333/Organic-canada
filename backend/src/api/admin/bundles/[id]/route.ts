import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BUNDLE_MODULE } from "../../../../modules/bundle"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(BUNDLE_MODULE)
    const bundle = await service.retrieveBundleDefinition(req.params.id)
    const items = await service.listBundleItems({ bundle_id: bundle.id }, { order: { sort_order: "ASC" } })
    return res.status(200).json({ bundle: { ...bundle, items } })
  } catch { return res.status(404).json({ message: "Bundle not found" }) }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(BUNDLE_MODULE)
    const existing = await service.retrieveBundleDefinition(req.params.id)
    const body = req.body as any
    const update: any = { id: existing.id }
    if (body.title !== undefined) update.title = String(body.title).trim()
    if (body.status !== undefined) {
      if (!["draft", "active", "archived"].includes(body.status)) throw new Error("Invalid bundle status")
      update.status = body.status
    }
    if (body.metadata !== undefined) update.metadata = body.metadata
    const bundle = await service.updateBundleDefinitions(update)
    return res.status(200).json({ bundle })
  } catch (error: any) { return res.status(422).json({ message: error.message || "Bundle update failed" }) }
}

export const PUT = POST

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: any = req.scope.resolve(BUNDLE_MODULE)
    await service.updateBundleDefinitions({ id: req.params.id, status: "archived" })
    return res.status(200).json({ id: req.params.id, archived: true })
  } catch { return res.status(404).json({ message: "Bundle not found" }) }
}
