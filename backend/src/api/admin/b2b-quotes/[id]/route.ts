import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { hydrateAdminQuote, retrieveAdminQuote, statusFromError } from "../utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const quote = await retrieveAdminQuote(req, req.params.id)
    return res.json({ quote: await hydrateAdminQuote(req, quote) })
  } catch (error: any) {
    console.error("[Admin B2B Quotes] Retrieve error:", error)
    return res.status(statusFromError(error)).json({
      message: error.message || "Failed to retrieve B2B quote",
    })
  }
}
