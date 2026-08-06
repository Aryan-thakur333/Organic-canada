import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { getCustomerCommissionType } from "../../../../../utils/commission/customer-type"

/**
 * GET /admin/customers/:id/commission-type
 * Retrieve the resolved commission type for a customer.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerService: any = req.scope.resolve(Modules.CUSTOMER)
    const { id } = req.params as { id: string }

    const customer = await customerService.retrieveCustomer(id)
    const commissionType = getCustomerCommissionType(customer)

    return res.json({ 
      customer_id: customer.id,
      commission_type: commissionType,
      raw_metadata_value: customer.metadata?.customer_type || null
    })
  } catch (error: any) {
    if (error?.type === "not_found" || /not found/i.test(error?.message)) {
      return res.status(404).json({ message: "Customer not found" })
    }
    console.error("[Admin Customer Commission] GET error:", error)
    return res.status(500).json({ message: "An unexpected error occurred." })
  }
}

/**
 * POST /admin/customers/:id/commission-type
 * Update a customer's commission type by modifying their metadata safely.
 * 
 * Body:
 *   commission_type: "b2b_customer" | "normal_customer"
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerService: any = req.scope.resolve(Modules.CUSTOMER)
    const { id } = req.params as { id: string }
    const { commission_type } = req.body as any

    // 1. Validation: only allow supported types
    if (!["b2b_customer", "normal_customer"].includes(commission_type)) {
      return res.status(400).json({ 
        message: "Invalid commission_type. Must be 'b2b_customer' or 'normal_customer'." 
      })
    }

    // 2. Fetch current customer safely
    let customer
    try {
      customer = await customerService.retrieveCustomer(id)
    } catch (e) {
      return res.status(404).json({ message: "Customer not found" })
    }

    // 3. Update customer metadata securely via backend
    const existingMetadata = customer.metadata || {}
    
    let updatedMetadata
    if (commission_type === "normal_customer") {
      // Remove the flag to fall back to normal customer
      const { customer_type, ...rest } = existingMetadata
      updatedMetadata = rest
    } else {
      // Explicitly set the B2B flag
      updatedMetadata = {
        ...existingMetadata,
        customer_type: "b2b_customer"
      }
    }

    const updatedCustomer = await customerService.updateCustomers({
      id,
      metadata: updatedMetadata
    })

    const newResolvedType = getCustomerCommissionType(updatedCustomer)

    return res.json({ 
      customer_id: updatedCustomer.id,
      commission_type: newResolvedType,
      message: `Customer commission type successfully set to ${newResolvedType}.`
    })
  } catch (error: any) {
    console.error("[Admin Customer Commission] POST error:", error)
    return res.status(500).json({ message: "Failed to update customer commission type." })
  }
}
