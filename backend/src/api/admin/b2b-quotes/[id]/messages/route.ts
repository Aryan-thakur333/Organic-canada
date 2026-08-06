import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  assertQuoteChatWritable,
  createQuoteMessage,
  listQuoteMessages,
  normalizeQuoteMessageBody,
  retrieveQuoteForMessages,
  statusFromQuoteMessageError,
} from "../../../../../utils/b2b/quote-messages"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const quote = await retrieveQuoteForMessages(req, req.params.id)
    return res.json({ messages: await listQuoteMessages(req, quote.id) })
  } catch (error: any) {
    console.error("[Admin B2B Quote Messages] List error:", error)
    return res.status(statusFromQuoteMessageError(error)).json({
      message: error.message || "Failed to list quote messages",
    })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const adminId = (req as any).auth_context?.actor_id || null

  try {
    const quote = await retrieveQuoteForMessages(req, req.params.id)
    assertQuoteChatWritable(quote)

    const message = await createQuoteMessage(req, {
      quote_id: quote.id,
      sender_type: "admin",
      sender_id: adminId,
      message: normalizeQuoteMessageBody(req.body),
    })

    return res.status(201).json({ message })
  } catch (error: any) {
    console.error("[Admin B2B Quote Messages] Create error:", error)
    return res.status(statusFromQuoteMessageError(error)).json({
      message: error.message || "Failed to create quote message",
    })
  }
}
