import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MARKETPLACE_MODULE } from "../../modules/marketplace/index"
import { VENDOR_MODULE } from "../../modules/vendor/index"
import { Modules } from "@medusajs/framework/utils"

type CreateVendorOrdersInput = {
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
    total: number // subtotal in minor units
  }>
}

export const createVendorOrdersStep = createStep(
  "create-vendor-orders",
  async (input: CreateVendorOrdersInput, { container }) => {
    const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)
    const createdOrders: any[] = []

    for (const bucket of input.buckets) {
      // 1. Idempotency Check — skip if already exists
      const existing = await marketplaceService.listVendorOrders({
        order_id: input.orderId,
        vendor_id: bucket.vendor_id,
      })

      if (existing && existing.length > 0) {
        console.log(
          `[create-vendor-orders] VendorOrder already exists for order=${input.orderId} vendor=${bucket.vendor_id}, skipping.`
        )
        createdOrders.push(existing[0])
        continue
      }

      // 2. Calculate totals in minor units
      const itemSubtotal = bucket.total // already in minor units from splitOrderWorkflow
      // Commission: 10% by default — ideally injected from commission module
      const commissionRate = 0.10
      const commissionTotal = Math.round(itemSubtotal * commissionRate)
      const vendorNetTotal = itemSubtotal - commissionTotal

      // 3. Create VendorOrder
      const vendorOrder = await marketplaceService.createVendorOrders({
        vendor_id: bucket.vendor_id,
        order_id: input.orderId,
        status: "pending",
        // payment_status will be "awaiting_payment" by model default
        // It gets updated by payment-captured-marketplace subscriber when payment is captured
        currency_code: input.currency_code,
        item_subtotal: itemSubtotal,
        commission_total: commissionTotal,
        vendor_net_total: vendorNetTotal,
      })

      console.log(
        `[create-vendor-orders] Created VendorOrder ${vendorOrder.id} for vendor=${bucket.vendor_id}, ` +
        `order=${input.orderId}, gross=${itemSubtotal}, commission=${commissionTotal}, net=${vendorNetTotal}`
      )

      // 4. Create VendorOrderItems
      for (const item of bucket.items) {
        const itemSubtotalMinor = item.quantity * item.unit_price
        const itemCommission = Math.round(itemSubtotalMinor * commissionRate)
        const itemNet = itemSubtotalMinor - itemCommission

        await marketplaceService.createVendorOrderItems({
          vendor_order_id: vendorOrder.id,
          order_id: input.orderId,
          line_item_id: item.line_item_id,
          order_item_id: item.line_item_id,
          product_id: item.product_id,
          variant_id: item.variant_id || "",
          vendor_id: bucket.vendor_id,
          title: item.title,
          sku: item.sku || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: itemSubtotalMinor,
          commission_amount: itemCommission,
          vendor_net_amount: itemNet,
        })
      }

      // 5. Earning record
      await marketplaceService.createVendorEarnings({
        vendor_order_id: vendorOrder.id,
        vendor_id: bucket.vendor_id,
        order_id: input.orderId,
        gross_amount: itemSubtotal,
        commission_amount: commissionTotal,
        net_amount: vendorNetTotal,
        status: "locked", // released to "available" on delivery
      })

      // 6. Activity Record
      await marketplaceService.createVendorOrderActivities({
        vendor_order_id: vendorOrder.id,
        vendor_id: bucket.vendor_id,
        type: "order_received",
        title: "Order received",
        actor_type: "system",
      })

      // 7. Remote Links — use proper Medusa module service keys
      try {
        const remoteLink = container.resolve("remoteLink")
        await remoteLink.create([
          {
            [VENDOR_MODULE]: { vendor_id: bucket.vendor_id },
            [MARKETPLACE_MODULE]: { vendor_order_id: vendorOrder.id },
          },
          {
            [Modules.ORDER]: { order_id: input.orderId },
            [MARKETPLACE_MODULE]: { vendor_order_id: vendorOrder.id },
          },
        ])
      } catch (linkErr: any) {
        // Non-fatal — links are best-effort; the VendorOrder itself is the source of truth
        if (!/already exists|duplicate/i.test(String(linkErr?.message || ""))) {
          console.error("[create-vendor-orders] Remote link creation failed:", linkErr?.message)
        }
      }

      createdOrders.push(vendorOrder)
    }

    return new StepResponse(createdOrders, createdOrders.map((o) => o.id))
  },
  // Compensation: delete any VendorOrders created in this step on rollback
  async (createdIds: string[], { container }) => {
    if (!createdIds || createdIds.length === 0) return
    try {
      const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)
      await marketplaceService.deleteVendorOrders(createdIds)
    } catch (err: any) {
      console.error("[create-vendor-orders] Compensation failed:", err?.message)
    }
  }
)
