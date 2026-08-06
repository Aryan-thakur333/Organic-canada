import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { B2B_MODULE } from "../modules/b2b/index"
import { QuoteStatus } from "./create-request-for-quote"

export type MerchantRejectQuoteInput = {
  quote_id: string
  reason: string
  admin_note?: string
}

const merchantRejectQuoteStep = createStep(
  "merchant-reject-quote-step",
  async (input: MerchantRejectQuoteInput, { container }) => {
    const b2bService: any = container.resolve(B2B_MODULE)
    const quote = await b2bService.retrieveQuote(input.quote_id)

    if (!quote) {
      const error: any = new Error("B2B quote not found")
      error.status = 404
      throw error
    }

    if (quote.status === QuoteStatus.ACCEPTED || quote.status === "accepted") {
      const error: any = new Error("Accepted quotes cannot be rejected")
      error.status = 400
      throw error
    }

    if (quote.status === QuoteStatus.MERCHANT_REJECTED) {
      const error: any = new Error("Quote is already merchant rejected")
      error.status = 400
      throw error
    }

    const updated = await b2bService.updateQuotes({
      id: input.quote_id,
      status: QuoteStatus.MERCHANT_REJECTED,
      rejection_reason: input.reason,
      admin_note: input.admin_note || null,
      rejected_at: new Date(),
      metadata: {
        ...(quote.metadata || {}),
        merchant_rejected_at: new Date().toISOString(),
      },
    })

    return new StepResponse(updated, {
      quote_id: input.quote_id,
      previous_status: quote.status,
      previous_rejection_reason: quote.rejection_reason,
      previous_admin_note: quote.admin_note,
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
      admin_note: data.previous_admin_note || null,
      rejected_at: data.previous_rejected_at || null,
      metadata: data.previous_metadata || null,
    })
  }
)

export const merchantRejectQuoteWorkflow = createWorkflow(
  "merchant-reject-quote",
  (input: MerchantRejectQuoteInput) => {
    return new WorkflowResponse(merchantRejectQuoteStep(input))
  }
)
