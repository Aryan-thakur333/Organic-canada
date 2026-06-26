import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

// ── Input Types ────────────────────────────────────────────────────────────

export type GetLineItemVendorsStepInput = {
  items: Array<{
    id: string
    product_id: string
    title: string
    quantity: number
    unit_price: number
    thumbnail?: string | null
  }>
}

export type LineItemWithVendor = {
  line_item_id: string
  product_id: string
  title: string
  quantity: number
  unit_price: number
  thumbnail: string | null
  vendor_id: string | null
}

// ── Step ───────────────────────────────────────────────────────────────────

/**
 * Resolves the owning vendor for each line item in an order
 * by querying the product→vendor link graph.
 */
export const getLineItemVendorsStep = createStep(
  "get-line-item-vendors",

  async ({ items }: GetLineItemVendorsStepInput, { container }) => {
    const query = container.resolve("query")

    // Collect unique product IDs from the line items
    const productIds = [
      ...new Set(items.map((item) => item.product_id).filter(Boolean)),
    ]

    if (productIds.length === 0) {
      return new StepResponse<LineItemWithVendor[]>([])
    }

    // Query the product→vendor link graph.
    // This leverages the `defineLink(ProductModule.linkable.product, VendorModule.linkable.vendor)`
    // link that was already synced via `npx medusa db:sync-links`.
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "metadata",
        "vendor.id",
        "vendor.store_name",
        "vendor.email",
      ],
      filters: { id: productIds },
    })

    // Build product_id → vendor_id lookup
    const vendorMap = new Map<string, string | null>()
    for (const product of products) {
      vendorMap.set(product.id, product.vendor?.id ?? (product.metadata?.vendor_id ? String(product.metadata.vendor_id) : null))
    }

    // Annotate each line item with its resolved vendor
    const result: LineItemWithVendor[] = items.map((item) => ({
      line_item_id: item.id,
      product_id: item.product_id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      thumbnail: item.thumbnail ?? null,
      vendor_id: vendorMap.get(item.product_id) ?? null,
    }))

    return new StepResponse(result)
  },

  // Compensate: read-only step, nothing to roll back
  async () => {}
)
