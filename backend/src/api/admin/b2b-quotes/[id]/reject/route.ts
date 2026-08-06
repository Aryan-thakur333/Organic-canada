import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../../modules/b2b"
import { hydrateAdminQuote, statusFromError } from "../../utils"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { reason, admin_note } = req.body as { reason?: string; admin_note?: string }

  if (!reason?.trim()) {
    return res.status(400).json({ message: "reason is required" })
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const quote = await b2bService.retrieveQuote(id)

    if (!quote) {
      return res.status(404).json({ message: "B2B quote not found" })
    }

    if (quote.status === "accepted") {
      return res.status(400).json({ message: "Accepted quotes cannot be rejected." })
    }

    if (quote.status === "customer_rejected") {
      return res.status(400).json({ message: "Customer rejected quotes cannot be merchant rejected." })
    }

    if (quote.status === "merchant_rejected" || quote.status === "rejected") {
      return res.json({
        quote: await hydrateAdminQuote(req, quote),
        message: "Quote is already merchant rejected.",
      })
    }

    const now = new Date()
    const updated = await b2bService.updateQuotes({
      id,
      status: "merchant_rejected",
      rejection_reason: reason.trim(),
      admin_note: admin_note || quote.admin_note || null,
      admin_notes: admin_note || quote.admin_notes || quote.admin_note || null,
      rejected_at: now,
      metadata: {
        ...(quote.metadata || {}),
        merchant_rejected_at: now.toISOString(),
      },
    })

    return res.json({
      quote: await hydrateAdminQuote(req, updated),
      message: "Quote rejected successfully.",
    })
  } catch (error: any) {
    console.error("[Admin B2B Quotes] Reject error:", error)
    return res.status(statusFromError(error)).json({
      message: error.message || "Failed to reject B2B quote",
    })
  }
}
