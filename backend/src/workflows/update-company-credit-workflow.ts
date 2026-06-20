import {
  createWorkflow,
  createStep,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { B2B_MODULE } from "../modules/b2b"
import { MedusaError } from "@medusajs/framework/utils"

// ── Types ──────────────────────────────────────────────────────────────────

export type UpdateCompanyCreditWorkflowInput = {
  company_id: string
  /**
   * Operation type:
   * - "add": increase the credit limit by `amount`
   * - "deduct": decrease the credit limit by `amount`
   * - "set": set the credit limit to an absolute `amount`
   */
  operation: "add" | "deduct" | "set"
  amount: number      // in cents
  reason?: string     // admin note for auditing
}

export type UpdateCompanyCreditWorkflowOutput = {
  company_id: string
  company_name: string
  previous_limit: number
  new_limit: number
  amount_delta: number
}

// ── Step: Apply credit adjustment ──────────────────────────────────────────

const applyCreditAdjustmentStep = createStep(
  "apply-credit-adjustment",

  async (
    { company_id, operation, amount }: UpdateCompanyCreditWorkflowInput,
    { container }
  ) => {
    const b2bService = container.resolve(B2B_MODULE) as any

    // Retrieve current company record
    const company = await b2bService.retrieveCompany(company_id, {
      select: ["id", "company_name", "credit_limit"],
    })

    if (!company) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Company "${company_id}" not found`
      )
    }

    const previous_limit = company.credit_limit ?? 0
    let new_limit: number

    switch (operation) {
      case "add":
        new_limit = previous_limit + amount
        break
      case "deduct":
        new_limit = Math.max(0, previous_limit - amount)
        break
      case "set":
        new_limit = Math.max(0, amount)
        break
      default:
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid operation "${operation}". Use "add", "deduct", or "set".`
        )
    }

    // Persist the updated credit_limit using the auto-generated MedusaService method
    const updated = await b2bService.updateCompanies({
      id: company_id,
      credit_limit: new_limit,
    })

    const output: UpdateCompanyCreditWorkflowOutput = {
      company_id: updated.id,
      company_name: updated.company_name,
      previous_limit,
      new_limit,
      amount_delta: new_limit - previous_limit,
    }

    return new StepResponse(output, {
      company_id,
      previous_limit,
    })
  },

  // Compensate: restore the previous credit limit on failure
  async (
    { company_id, previous_limit }: { company_id: string; previous_limit: number },
    { container }
  ) => {
    const b2bService = container.resolve(B2B_MODULE) as any
    await b2bService.updateCompanies({
      id: company_id,
      credit_limit: previous_limit,
    })
  }
)

// ── Workflow ───────────────────────────────────────────────────────────────

/**
 * Update Company Credit Workflow
 *
 * Allows an admin to add, deduct, or set a company's credit limit.
 * The workflow is fully compensatable — if any subsequent step fails,
 * the credit limit is restored to its previous value.
 *
 * Usage:
 * ```
 * const { result } = await updateCompanyCreditWorkflow(container).run({
 *   input: {
 *     company_id: "01J...",
 *     operation: "deduct",
 *     amount: 5000,      // deduct €50.00
 *     reason: "Order #1234 placed",
 *   }
 * })
 * ```
 */
export const updateCompanyCreditWorkflow = createWorkflow(
  "update-company-credit",

  (input: UpdateCompanyCreditWorkflowInput) => {
    const result = applyCreditAdjustmentStep(input)

    return new WorkflowResponse(result)
  }
)
