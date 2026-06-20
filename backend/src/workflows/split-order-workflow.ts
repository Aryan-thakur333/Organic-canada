import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { getLineItemVendorsStep } from "./steps/get-line-item-vendors"
import type { LineItemWithVendor } from "./steps/get-line-item-vendors"

// ── Types ──────────────────────────────────────────────────────────────────

export type SplitOrderWorkflowInput = {
  orderId: string
  currency_code: string
  items: Array<{
    id: string
    product_id: string
    title: string
    quantity: number
    unit_price: number
    thumbnail?: string | null
  }>
}

export type VendorBucket = {
  vendor_id: string
  items: LineItemWithVendor[]
  item_count: number
  total: number          // subtotal in cents
  currency_code?: string
}

export type SplitOrderWorkflowOutput = {
  orderId: string
  buckets: VendorBucket[]
  unlinked_items: LineItemWithVendor[]
  vendor_count: number
}

// ── Workflow ───────────────────────────────────────────────────────────────

/**
 * Split Order Workflow
 *
 * Orchestrates the multi-vendor order split process:
 * 1. Resolves vendor ownership for each line item via product→vendor links
 * 2. Groups items into per-vendor buckets
 * 3. Returns structured payloads for downstream processing (fulfillment, metrics, payouts)
 *
 * Trigger this from a subscriber or API route:
 * ```
 * const { result } = await splitOrderWorkflow(container).run({
 *   input: { orderId, items }
 * })
 * ```
 */
export const splitOrderWorkflow = createWorkflow(
  "split-order",
  (input: SplitOrderWorkflowInput) => {
    // Step 1: Resolve vendor_id for every line item
    const itemsWithVendors = getLineItemVendorsStep({
      items: input.items,
    })

    // Step 2: Group items by vendor
    const { buckets, unlinked } = transform(
      { items: itemsWithVendors },
      ({ items }) => {
        const vendorMap = new Map<string, VendorBucket>()
        const unlinked: LineItemWithVendor[] = []

        for (const item of items) {
          if (!item.vendor_id) {
            unlinked.push(item)
            continue
          }

          let bucket = vendorMap.get(item.vendor_id)
          if (!bucket) {
            bucket = {
              vendor_id: item.vendor_id,
              items: [],
              item_count: 0,
              total: 0,
            }
            vendorMap.set(item.vendor_id, bucket)
          }

          bucket.items.push(item)
          bucket.item_count += item.quantity
          bucket.total += item.unit_price * item.quantity
        }

        const buckets = Array.from(vendorMap.values())

        return { buckets, unlinked }
      }
    )

    // Step 3: Assemble the output with currency_code enriched into buckets
    const output = transform(
      { input, buckets, unlinked },
      ({ input, buckets, unlinked }) => {
        const result: SplitOrderWorkflowOutput = {
          orderId: input.orderId,
          buckets: buckets.map((b) => ({
            ...b,
            currency_code: input.currency_code,
          })),
          unlinked_items: unlinked,
          vendor_count: buckets.length,
        }

        return result
      }
    )

    // Log summary after workflow resolves
    transform({ input, buckets }, ({ input, buckets }) => {
      if (buckets.length > 0) {
        console.log(
          `[SplitOrder] Order ${input.orderId}: ${buckets.length} vendor(s)`
        )
      }
    })

    return new WorkflowResponse(output)
  }
)
