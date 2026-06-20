import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"
import { createWorkflow } from "@medusajs/framework/workflows-sdk"
import { deductBundleInventoryStep, type DeductBundleInventoryStepInput, type DeductBundleInventoryStepOutput } from "../workflows/steps/deduct-bundle-inventory"

/**
 * Workflow wrapper around the bundle inventory deduction step.
 * Enables proper compensation/rollback via the Medusa workflow engine.
 */
const deductBundleWorkflow = createWorkflow(
  "deduct-bundle-inventory",
  (input: DeductBundleInventoryStepInput) => {
    return deductBundleInventoryStep(input)
  }
)

/**
 * order.placed subscriber: intercepts new orders, identifies bundle line items,
 * and deducts inventory for each child SKU with full rollback compensation.
 */
export default async function orderPlacedBundleHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id
  const query = container.resolve("query") as any

  try {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "items.id",
        "items.product_id",
        "items.variant_id",
        "items.title",
        "items.quantity",
        "items.unit_price",
        "items.metadata",
      ],
      filters: { id: orderId },
    })

    const order = orders?.[0]
    if (!order) {
      console.warn(`[OrderPlaced Bundle] Order ${orderId} not found`)
      return
    }

    const items = (order.items || []).map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      metadata: item.metadata,
    }))

    if (items.length === 0) {
      console.log(`[OrderPlaced Bundle] Order ${orderId} has no items`)
      return
    }

    const workflow = deductBundleWorkflow(container)
    const { result: raw } = await workflow.run({
      input: { order_id: orderId, items },
    })

    const result = raw as DeductBundleInventoryStepOutput

    if (result.total_deductions > 0) {
      console.log(
        `[OrderPlaced Bundle] Deducted bundle inventory for order ${orderId}: ` +
        `${result.total_deductions} child item(s) across ${result.bundle_groups.length} bundle(s)`
      )
    }
  } catch (error: any) {
    console.error(`[OrderPlaced Bundle] Failed: ${error.message}`)
    throw error
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
