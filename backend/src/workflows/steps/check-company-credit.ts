import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { B2B_MODULE } from "../../modules/b2b"
import { MedusaError } from "@medusajs/framework/utils"

// ── Types ──────────────────────────────────────────────────────────────────

export type CheckCompanyCreditStepInput = {
  company_id: string
  cart_total: number     // in cents
}

export type CheckCompanyCreditStepOutput = {
  company_id: string
  company_name: string
  credit_limit: number   // in cents
  cart_total: number      // in cents
  remaining_credit: number
  is_approved: boolean
}

// ── Step ───────────────────────────────────────────────────────────────────

/**
 * Checks whether a company's credit limit is sufficient to cover the cart total.
 *
 * Resolves the Company record via the B2B module service, compares
 * credit_limit against the cart total, and throws a MedusaError if
 * the total exceeds the available credit.
 *
 * Intended to be composed into a checkout workflow for B2B customers.
 */
export const checkCompanyCreditStep = createStep(
  "check-company-credit",

  async (
    { company_id, cart_total }: CheckCompanyCreditStepInput,
    { container }
  ) => {
    const b2bService = container.resolve(B2B_MODULE) as any

    // Retrieve the company record using the auto-generated MedusaService method
    const company = await b2bService.retrieveCompany(company_id, {
      select: ["id", "company_name", "credit_limit", "status"],
    })

    if (!company) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Company with id "${company_id}" not found`
      )
    }

    if (company.status !== "active" && company.status !== "approved") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Company "${company.company_name}" is ${company.status}. Corporate checkout is not permitted.`
      )
    }

    const credit_limit = company.credit_limit ?? 0
    const remaining_credit = credit_limit - cart_total
    const is_approved = remaining_credit >= 0

    if (!is_approved) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Insufficient credit limit for corporate checkout. ` +
        `Cart total (${cart_total}) exceeds available credit (${credit_limit}).`
      )
    }

    const output: CheckCompanyCreditStepOutput = {
      company_id: company.id,
      company_name: company.company_name,
      credit_limit,
      cart_total,
      remaining_credit,
      is_approved,
    }

    return new StepResponse(output)
  },

  // Compensate: read-only check, nothing to roll back
  async () => {}
)
