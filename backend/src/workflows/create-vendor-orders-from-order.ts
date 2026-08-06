import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createVendorOrdersStep } from "./steps/create-vendor-orders"

type WorkflowInput = {
  orderId: string
  currency_code: string
  buckets: Array<{
    vendor_id: string
    items: Array<{
      line_item_id: string
      product_id: string
      variant_id?: string
      title: string
      sku?: string
      quantity: number
      unit_price: number
    }>
    item_count: number
    total: number
  }>
}

export const createVendorOrdersFromOrderWorkflow = createWorkflow(
  "create-vendor-orders-from-order",
  (input: WorkflowInput) => {
    const createdOrders = createVendorOrdersStep(input)
    return new WorkflowResponse(createdOrders)
  }
)
