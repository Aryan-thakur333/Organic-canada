import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerAcceptQuoteWorkflow } from "../../../../../../workflows/customer-accept-quote"

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
    const { result } = await customerAcceptQuoteWorkflow(req.scope).run({
      input: {
        quote_id: req.params.id,
        customer_id: customerId,
        offer_version: (req.body as any)?.offer_version,
        settlement_mode: (req.body as any)?.settlement_mode,
        selected_payment_provider_id: (req.body as any)?.selected_payment_provider_id,
        shipping_address_id: (req.body as any)?.shipping_address_id,
        shipping_address: (req.body as any)?.shipping_address,
      },
    })

    return res.json({
      message: "Quote accepted. Order created.",
      quote: result.quote,
      order: result.order,
    })
  } catch (error: any) {
    console.error("[B2B Quotes] Accept error:", error)
    return res.status(statusFromError(error)).json({
      message: error.message || "Failed to accept quote",
    })
  }
}
