// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { asArray, getVendorProductIdSets } from "../../_ownership"

async function getVendorOrderAccess(req: MedusaRequest, orderId: string) {
  const vendor = (req as any).vendor
  const query = req.scope.resolve("query")

  const { productIds, variantIds } = await getVendorProductIdSets(query, vendor.id)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "fulfillment_status",
      "metadata",
      "items.id",
      "items.product_id",
      "items.variant_id",
      "items.title",
      "items.quantity",
      "items.unit_price",
    ],
    filters: { id: orderId },
  })

  const order = orders?.[0]
  if (!order) return { accessible: false, reason: "Order not found" }

  const vendorItems = asArray(order.items).filter((item: any) =>
    (item.variant_id && variantIds.has(item.variant_id)) ||
    (item.product_id && productIds.has(item.product_id))
  )

  if (!vendorItems.length) return { accessible: false, reason: "No vendor items in this order" }

  return { accessible: true, vendor, order, vendorItems }
}

/**
 * Valid state transitions for the vendor fulfillment state machine.
 * Vendors must progress through each state in order.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["accepted"],
  accepted: ["packed"],
  packed: ["shipped"],
  shipped: ["delivered"],
  // Allow retrying from any state in case of recovery
  rejected: ["accepted"],
}

export async function updateVendorOrderState(
  req: MedusaRequest,
  res: MedusaResponse,
  state: "accepted" | "packed" | "shipped" | "delivered"
) {
  const { id } = req.params
  const access = await getVendorOrderAccess(req, id)

  if (!access.accessible) {
    return res.status(404).json({ message: access.reason })
  }

  const vendorId = access.vendor.id
  const body = (req.body || {}) as any
  const now = new Date().toISOString()
  const orderService: any = req.scope.resolve(Modules.ORDER)
  const existingMetadata = access.order.metadata || {}
  const vendorActions = existingMetadata.vendor_actions || {}
  const vendorTracking = existingMetadata.vendor_tracking || {}
  const vendorFulfillments = existingMetadata.vendor_fulfillments || {}

  // ── State Machine Validation ────────────────────────────────────────────
  const existingAction = vendorActions[vendorId]?.action || "pending"
  const allowedNext = VALID_TRANSITIONS[existingAction]

  if (!allowedNext || !allowedNext.includes(state)) {
    return res.status(409).json({
      message: `Cannot transition from "${existingAction}" to "${state}". Allowed transitions: ${allowedNext?.join(", ") || "none"}`,
      current_state: existingAction,
      requested_state: state,
      allowed_transitions: allowedNext || [],
    })
  }

  if (existingAction === state) {
    return res.status(409).json({
      message: `Order is already in state "${state}".`,
      current_state: state,
    })
  }

  vendorActions[vendorId] = {
    action: state,
    updated_at: now,
  }

  if (state === "shipped") {
    const trackingNumber = String(body.tracking_number || body.tracking_code || "").trim()
    if (!trackingNumber) {
      return res.status(400).json({ message: "tracking_number is required" })
    }

    vendorTracking[vendorId] = {
      tracking_number: trackingNumber,
      tracking_code: trackingNumber,
      carrier: body.carrier || "Other",
      tracking_url: body.tracking_url || "",
      updated_at: now,
    }
  }

  if (state === "delivered") {
    vendorFulfillments[vendorId] = {
      ...(vendorFulfillments[vendorId] || {}),
      delivered_at: now,
    }
  }

  if (state === "packed" || state === "shipped" || state === "delivered") {
    vendorFulfillments[vendorId] = {
      ...(vendorFulfillments[vendorId] || {}),
      [`${state}_at`]: now,
      items: access.vendorItems.map((item: any) => ({
        item_id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        title: item.title,
        quantity: item.quantity,
      })),
    }
  }

  await orderService.updateOrders({
    id,
    metadata: {
      ...existingMetadata,
      vendor_actions: vendorActions,
      vendor_tracking: vendorTracking,
      vendor_fulfillments: vendorFulfillments,
      vendor_fulfillment_status: state,
    },
  })

  return res.json({
    message: `Order ${state} successfully`,
    order_id: id,
    vendor_fulfillment_status: state,
    vendor_action: vendorActions[vendorId],
    tracking: vendorTracking[vendorId] || null,
  })
}
