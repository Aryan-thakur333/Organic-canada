// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { safeNumber, safeDivide } from "../../../utils/as-array"
import { asArray, getVendorProductIdSets } from "../_ownership"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ orders: [], count: 0, message: "Authentication required" })
  }

  const query = req.scope.resolve("query")
  if (!query) {
    return res.status(500).json({ orders: [], count: 0, message: "Query service unavailable" })
  }

  try {
    const { productIds, variantIds } = await getVendorProductIdSets(query, vendor.id)

    if (!productIds.size && !variantIds.size) {
      return res.json({ orders: [], count: 0 })
    }

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "status",
        "fulfillment_status",
        "payment_status",
        "created_at",
        "updated_at",
        "currency_code",
        "metadata",
        "email",
        "shipping_address.first_name",
        "shipping_address.last_name",
        "shipping_address.address_1",
        "shipping_address.city",
        "shipping_address.province",
        "shipping_address.postal_code",
        "shipping_address.country_code",
        "items.id",
        "items.product_id",
        "items.variant_id",
        "items.title",
        "items.quantity",
        "items.unit_price",
        "items.thumbnail",
        "items.metadata",
      ],
      pagination: { take: 500 },
    })

    const ordersArray = asArray(orders)
    const sandboxedOrders = ordersArray
      .map((order: any) => {
        if (!order?.id) return null

        const orderItems = asArray(order.items)
        const vendorItems = orderItems.filter((item: any) =>
          (item?.variant_id && variantIds.has(item.variant_id)) ||
          (item?.product_id && productIds.has(item.product_id))
        )

        if (!vendorItems.length) return null

        // Annotate items with digital detection
        const annotatedItems = vendorItems.map((item: any) => {
          const itemMeta = item.metadata || {}
          const isDigital = 
            itemMeta.is_digital === true ||
            itemMeta.is_digital === "true" ||
            itemMeta.product_type === "digital"
          // Attach product metadata to items for digital detection
          return {
            ...item,
            metadata: {
              ...itemMeta,
              is_digital: isDigital,
            },
          }
        })

        // Detect if all vendor items are digital
        const hasDigitalItems = annotatedItems.some((item: any) => 
          item.metadata?.is_digital === true || item.metadata?.is_digital === "true"
        )
        const allDigital = hasDigitalItems && annotatedItems.every((item: any) => 
          item.metadata?.is_digital === true || item.metadata?.is_digital === "true"
        )

        const vendorSubtotalCents = annotatedItems.reduce(
          (sum: number, item: any) =>
            sum + safeNumber(item?.unit_price, 0) * safeNumber(item?.quantity, 0),
          0
        )

        const vendorSubtotal = vendorSubtotalCents / 100
        const vendorId = vendor.id

        // Safe extraction of vendor metadata
        const orderMetadata = order.metadata || {}
        const vendorTracking = orderMetadata?.vendor_tracking?.[vendorId] || null
        const vendorFulfillments = orderMetadata?.vendor_fulfillments?.[vendorId] || null
        let vendorFulfillmentStatus = orderMetadata?.vendor_fulfillment_status || "pending"

        // For all-digital orders, fulfillment is automatic
        if (allDigital && vendorFulfillmentStatus === "pending") {
          vendorFulfillmentStatus = "delivered"
        }

        // Build per-state timestamps
        const vendorTimestamps = vendorFulfillments
          ? {
              accepted: vendorFulfillments.accepted_at || null,
              packed: vendorFulfillments.packed_at || null,
              shipped: vendorFulfillments.shipped_at || null,
              delivered: allDigital ? new Date().toISOString() : (vendorFulfillments.delivered_at || null),
            }
          : allDigital
            ? { delivered: new Date().toISOString() }
            : null

        const shippingAddress = order.shipping_address || null
        const customerName = shippingAddress
          ? [shippingAddress.first_name, shippingAddress.last_name].filter(Boolean).join(" ") || "Customer"
          : "Customer"

        return {
          id: order.id,
          display_id: order.display_id || order.id?.slice(-6).toUpperCase(),
          created_at: order.created_at,
          updated_at: order.updated_at,
          currency_code: order.currency_code || "cad",
          customer_email: order.email || "",
          customer_name: customerName,
          status: order.status || "pending",
          payment_status: order.payment_status || "pending",
          fulfillment_status: allDigital ? "fulfilled" : (order.fulfillment_status || "not_fulfilled"),
          vendor_fulfillment_status: vendorFulfillmentStatus,
          vendor_subtotal: safeNumber(vendorSubtotal, 0),
          vendor_subtotal_cents: vendorSubtotalCents,
          items: annotatedItems,
          has_digital_items: hasDigitalItems,
          all_digital: allDigital,
          item_count: annotatedItems.reduce((sum: number, item: any) => sum + safeNumber(item?.quantity, 0), 0),
          tracking: allDigital ? null : vendorTracking,
          vendor_timestamps: vendorTimestamps,
          shipping_address: shippingAddress,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (!a?.created_at || !b?.created_at) return 0
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

    return res.json({
      orders: sandboxedOrders,
      count: sandboxedOrders.length,
    })
  } catch (error: any) {
    console.error("Error fetching vendor orders:", error)
    return res.status(500).json({
      orders: [],
      count: 0,
      message: error.message || "Failed to fetch orders",
    })
  }
}
