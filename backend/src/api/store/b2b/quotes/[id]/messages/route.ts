import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  assertQuoteChatWritable,
  assertStoreQuoteAccess,
  createQuoteMessage,
  listQuoteMessages,
  normalizeQuoteMessageBody,
  retrieveQuoteForMessages,
  statusFromQuoteMessageError,
} from "../../../../../../utils/b2b/quote-messages"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const quote = await retrieveQuoteForMessages(req, req.params.id)
    await assertStoreQuoteAccess(req, quote, customerId)
    return res.json({ messages: await listQuoteMessages(req, quote.id) })
  } catch (error: any) {
    console.error("[B2B Quote Messages] Store list error:", error)
    return res.status(statusFromQuoteMessageError(error)).json({
      message: error.message || "Failed to list quote messages",
    })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const quote = await retrieveQuoteForMessages(req, req.params.id)
    await assertStoreQuoteAccess(req, quote, customerId)
    assertQuoteChatWritable(quote)

    const message = await createQuoteMessage(req, {
      quote_id: quote.id,
      sender_type: "customer",
      sender_id: customerId,
      message: normalizeQuoteMessageBody(req.body),
    })

    return res.status(201).json({ message })
  } catch (error: any) {
    console.error("[B2B Quote Messages] Store create error:", error)
    return res.status(statusFromQuoteMessageError(error)).json({
      message: error.message || "Failed to create quote message",
    })
  }
}
