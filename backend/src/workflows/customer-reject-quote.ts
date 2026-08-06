import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { B2B_MODULE } from "../modules/b2b/index"
import { QuoteStatus } from "./create-request-for-quote"

export type CustomerRejectQuoteInput = {
  quote_id: string
  customer_id: string
  reason?: string
}

async function getCustomerCompanyId(query: any, customerId: string) {
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "company.id"],
    filters: { id: customerId },
  })

  return customers?.[0]?.company?.id || null
}

async function assertQuoteAccess(quote: any, customerId: string, query: any) {
  if (quote.customer_id === customerId) {
    return
  }

  const customerCompanyId = await getCustomerCompanyId(query, customerId)
  if (customerCompanyId && quote.company_id === customerCompanyId) {
    return
  }

  const error: any = new Error("Quote not found")
  error.status = 404
  throw error
}

const customerRejectQuoteStep = createStep(
  "customer-reject-quote-step",
  async (input: CustomerRejectQuoteInput, { container }) => {
    const b2bService: any = container.resolve(B2B_MODULE)
    const query: any = container.resolve("query")
    const quote = await b2bService.retrieveQuote(input.quote_id)

    if (!quote) {
      const error: any = new Error("Quote not found")
      error.status = 404
      throw error
    }

    await assertQuoteAccess(quote, input.customer_id, query)

    if (quote.status === QuoteStatus.ACCEPTED) {
      const error: any = new Error("Accepted quotes cannot be rejected")
      error.status = 400
      throw error
    }

    if (quote.status === QuoteStatus.CUSTOMER_REJECTED) {
      return new StepResponse(quote)
    }

    if (quote.status === QuoteStatus.MERCHANT_REJECTED || quote.status === "rejected") {
      const error: any = new Error("Merchant rejected quotes cannot be rejected by customer")
      error.status = 400
      throw error
    }

    if (quote.status !== QuoteStatus.PENDING_CUSTOMER) {
      const error: any = new Error(`Quote status is "${quote.status}". Only pending_customer quotes can be rejected.`)
      error.status = 400
      throw error
    }

    const updated = await b2bService.updateQuotes({
      id: quote.id,
      status: QuoteStatus.CUSTOMER_REJECTED,
      rejection_reason: input.reason || "Rejected by customer",
      rejected_at: new Date(),
      metadata: {
        ...(quote.metadata || {}),
        customer_rejected_at: new Date().toISOString(),
        customer_rejection_reason: input.reason || null,
      },
    })

    return new StepResponse(updated, {
      quote_id: quote.id,
      previous_status: quote.status,
      previous_rejection_reason: quote.rejection_reason,
      previous_rejected_at: quote.rejected_at,
      previous_metadata: quote.metadata,
    })
  },
  async (data: any, { container }) => {
    if (!data?.quote_id) return
    const b2bService: any = container.resolve(B2B_MODULE)
    await b2bService.updateQuotes({
      id: data.quote_id,
      status: data.previous_status,
      rejection_reason: data.previous_rejection_reason || null,
      rejected_at: data.previous_rejected_at || null,
      metadata: data.previous_metadata || null,
    })
  }
)

export const customerRejectQuoteWorkflow = createWorkflow(
  "customer-reject-quote",
  (input: CustomerRejectQuoteInput) => {
    return new WorkflowResponse(customerRejectQuoteStep(input))
  }
)
