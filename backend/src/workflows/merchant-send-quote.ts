import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { B2B_MODULE } from "../modules/b2b/index"
import { QuoteStatus } from "./create-request-for-quote"

export type MerchantSendQuoteInput = {
  quote_id: string
  admin_note?: string
}

const merchantSendQuoteStep = createStep(
  "merchant-send-quote-step",
  async (input: MerchantSendQuoteInput, { container }) => {
    const b2bService: any = container.resolve(B2B_MODULE)
    const quote = await b2bService.retrieveQuote(input.quote_id)

    if (!quote) {
      const error: any = new Error("B2B quote not found")
      error.status = 404
      throw error
    }

    if (quote.status !== QuoteStatus.PENDING_MERCHANT) {
      const error: any = new Error(`Quote status is "${quote.status}". Only pending_merchant quotes can be sent.`)
      error.status = 400
      throw error
    }

    if (!quote.draft_order_id || !quote.order_change_id) {
      const error: any = new Error("Quote must have a draft order and order change before it can be sent")
      error.status = 400
      throw error
    }

    const updated = await b2bService.updateQuotes({
      id: input.quote_id,
      status: QuoteStatus.PENDING_CUSTOMER,
      admin_note: input.admin_note || quote.admin_note || null,
      metadata: {
        ...(quote.metadata || {}),
        sent_to_customer_at: new Date().toISOString(),
      },
    })

    return new StepResponse(updated, {
      quote_id: input.quote_id,
      previous_status: quote.status,
      previous_admin_note: quote.admin_note,
      previous_metadata: quote.metadata,
    })
  },
  async (data: any, { container }) => {
    if (!data?.quote_id) return
    const b2bService: any = container.resolve(B2B_MODULE)
    await b2bService.updateQuotes({
      id: data.quote_id,
      status: data.previous_status,
      admin_note: data.previous_admin_note || null,
      metadata: data.previous_metadata || null,
    })
  }
)

export const merchantSendQuoteWorkflow = createWorkflow(
  "merchant-send-quote",
  (input: MerchantSendQuoteInput) => {
    return new WorkflowResponse(merchantSendQuoteStep(input))
  }
)
