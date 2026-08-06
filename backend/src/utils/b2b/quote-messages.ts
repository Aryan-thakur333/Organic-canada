import { B2B_MODULE } from "../../modules/b2b"

export const QUOTE_MESSAGE_MAX_LENGTH = 2000
export const QUOTE_MESSAGE_LOCKED_STATUSES = [
  "accepted",
  "customer_rejected",
  "merchant_rejected",
  "rejected",
]

export function normalizeQuoteMessageBody(body: any): string {
  const message = String(body?.message || "").trim()
  if (!message) {
    const error: any = new Error("Message is required")
    error.status = 400
    throw error
  }

  if (message.length > QUOTE_MESSAGE_MAX_LENGTH) {
    const error: any = new Error(`Message must be ${QUOTE_MESSAGE_MAX_LENGTH} characters or fewer`)
    error.status = 400
    throw error
  }

  return message
}

export function formatQuoteMessage(message: any) {
  return {
    id: message.id,
    quote_id: message.quote_id,
    sender_type: message.sender_type,
    sender_id: message.sender_id,
    message: message.message,
    is_system_message: Boolean(message.is_system_message),
    read_at: message.read_at,
    created_at: message.created_at,
    updated_at: message.updated_at,
    metadata: message.metadata,
  }
}

async function customerCompanyId(query: any, customerId: string) {
  try {
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id", "company.id"],
      filters: { id: customerId },
    })
    return data?.[0]?.company?.id || null
  } catch {
    return null
  }
}

async function customerActiveMemberCompanyIds(b2bService: any, customerId: string) {
  try {
    const members = await b2bService.listCompanyMembers(
      { customer_id: customerId, status: "active" },
      { take: 100 }
    )
    return (members || []).map((member: any) => member.company_id).filter(Boolean)
  } catch {
    return []
  }
}

export async function assertStoreQuoteAccess(req: any, quote: any, customerId: string) {
  if (quote.customer_id === customerId) return

  const query: any = req.scope.resolve("query")
  const b2bService: any = req.scope.resolve(B2B_MODULE)
  const directCompanyId = await customerCompanyId(query, customerId)
  if (directCompanyId && directCompanyId === quote.company_id) return

  const memberCompanyIds = await customerActiveMemberCompanyIds(b2bService, customerId)
  if (memberCompanyIds.includes(quote.company_id)) return

  const error: any = new Error("Quote not found")
  error.status = 404
  throw error
}

export async function retrieveQuoteForMessages(req: any, quoteId: string) {
  const b2bService: any = req.scope.resolve(B2B_MODULE)
  const quote = await b2bService.retrieveQuote(quoteId)
  if (!quote) {
    const error: any = new Error("Quote not found")
    error.status = 404
    throw error
  }
  return quote
}

export async function listQuoteMessages(req: any, quoteId: string) {
  const b2bService: any = req.scope.resolve(B2B_MODULE)
  const messages = await b2bService.listQuoteMessages(
    { quote_id: quoteId },
    { take: 200, order: { created_at: "ASC" } }
  )
  return (messages || []).map(formatQuoteMessage)
}

export async function createQuoteMessage(req: any, input: {
  quote_id: string
  sender_type: "customer" | "admin" | "system"
  sender_id?: string | null
  message: string
  is_system_message?: boolean
  metadata?: Record<string, any> | null
}) {
  const b2bService: any = req.scope.resolve(B2B_MODULE)
  const created = await b2bService.createQuoteMessages({
    quote_id: input.quote_id,
    sender_type: input.sender_type,
    sender_id: input.sender_id || null,
    message: input.message,
    is_system_message: Boolean(input.is_system_message || input.sender_type === "system"),
    metadata: input.metadata || null,
  })
  return formatQuoteMessage(created)
}

export function assertQuoteChatWritable(quote: any) {
  if (QUOTE_MESSAGE_LOCKED_STATUSES.includes(String(quote.status || ""))) {
    const error: any = new Error("This quote is locked. New negotiation messages are disabled.")
    error.status = 400
    throw error
  }
}

export function statusFromQuoteMessageError(error: any) {
  if (Number.isInteger(error?.status)) return error.status
  if (error?.type === "not_found") return 404
  return 400
}
