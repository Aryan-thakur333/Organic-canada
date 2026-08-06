import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerRejectQuoteWorkflow } from "../../../../../../workflows/customer-reject-quote"

function statusFromError(error: any) {
  if (Number.isInteger(error?.status)) return error.status
  if (error?.type === "not_found") return 404
  return 400
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const { result } = await customerRejectQuoteWorkflow(req.scope).run({
      input: {
        quote_id: req.params.id,
        customer_id: customerId,
        reason: (req.body as any)?.reason,
      },
    })

    return res.json({
      message: "Quote rejected.",
      quote: result,
    })
  } catch (error: any) {
    console.error("[B2B Quotes] Reject error:", error)
    return res.status(statusFromError(error)).json({
      message: error.message || "Failed to reject quote",
    })
  }
}
