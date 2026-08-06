import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createOrderFulfillmentWorkflow } from "@medusajs/core-flows"
import { MARKETPLACE_MODULE } from "../modules/marketplace/index"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

type CreateVendorFulfillmentInput = {
  vendor_order_id: string
  vendor_id: string
  location_id: string
  order_id: string
  items: Array<{
    id: string
    quantity: number
  }>
}

const updateVendorOrderStatusStep = createStep(
  "update-vendor-order-fulfillment-status",
  async (input: { vendor_order_id: string, fulfillment_id: string }, { container }) => {
    const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)
    
    await marketplaceService.updateVendorOrders({
      id: input.vendor_order_id,
      status: "ready_to_ship",
      fulfillment_status: "fulfilled",
      metadata: {
        fulfillment_id: input.fulfillment_id
      }
    })

    return new StepResponse(null)
  }
)

export const createVendorFulfillmentWorkflow = createWorkflow(
  "create-vendor-fulfillment",
  (input: CreateVendorFulfillmentInput) => {
    
    // Call native Medusa order fulfillment workflow
    const fulfillmentResult = createOrderFulfillmentWorkflow.runAsStep({
      input: {
        order_id: input.order_id,
        items: input.items,
        location_id: input.location_id,
        labels: [],
        no_notification: false,
        metadata: {
          source: "vendor_portal",
          vendor_id: input.vendor_id,
          vendor_order_id: input.vendor_order_id
        }
      }
    })

    // Update VendorOrder status
    updateVendorOrderStatusStep({
      vendor_order_id: input.vendor_order_id,
      fulfillment_id: fulfillmentResult.id,
    })

    return new WorkflowResponse(fulfillmentResult)
  }
)
