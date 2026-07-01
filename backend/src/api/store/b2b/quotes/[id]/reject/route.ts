import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../../../modules/b2b"
import { MedusaError } from "@medusajs/framework/utils"

/**
 * POST /store/b2b/quotes/:id/reject
 *
 * Customer declines an approved quote.
 * Sets status to rejected with customer rejection metadata.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const service: any = req.scope.resolve(B2B_MODULE)

    const quote = await service.retrieveQuote(req.params.id)
    if (!quote || quote.customer_id !== customerId) {
      return res.status(404).json({ message: "Quote not found" })
    }

    if (quote.status !== "approved") {
      return res.status(409).json({
        message: `Quote status is "${quote.status}". Only approved quotes can be declined.`,
      })
    }

    const updated = await service.updateQuotes({
      id: quote.id,
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejection_reason: (req.body as any)?.reason || "Declined by customer",
      metadata: {
        ...(quote.metadata || {}),
        rejected_by_customer_at: new Date().toISOString(),
        customer_rejection_reason: (req.body as any)?.reason || null,
      },
    })

    console.log(
      `[B2B Quotes] Quote ${quote.id} rejected by customer ${customerId}.`
    )

    return res.json({
      message: "Quote declined.",
      quote: {
        id: updated.id,
        status: updated.status,
        rejected_at: updated.rejected_at,
      },
    })
  } catch (error: any) {
    console.error("[B2B Quotes] Reject error:", error)

    if (error instanceof MedusaError) {
      if (error.type === "not_found") {
        return res.status(404).json({ message: "Quote not found" })
      }
      return res.status(400).json({ message: error.message })
    }

    return res.status(500).json({
      message: error.message || "Failed to decline quote",
    })
  }
}