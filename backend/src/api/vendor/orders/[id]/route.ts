import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import { Modules } from "@medusajs/framework/utils"
import { syncVendorOrderFulfillmentState } from "../../../../utils/marketplace/sync-vendor-fulfillment-state"
import { resolveVendorFulfillment } from "../../../../utils/marketplace/resolve-vendor-fulfillment"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getPaymentStatusSource(order: unknown): string | null {
  if (!isRecord(order)) {
    return null
  }

  const paymentCollections = order.payment_collections
  if (Array.isArray(paymentCollections)) {
    const firstCollection = paymentCollections[0]
    if (isRecord(firstCollection)) {
      const status = firstCollection.status
      if (typeof status === "string") {
        return status
      }
    }
  }

  return typeof order.payment_status === "string" ? order.payment_status : null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const vendorOrderId = req.params.id
  const marketplaceService: any = req.scope.resolve(MARKETPLACE_MODULE)
  const container = req.scope

  try {
    const vo = await marketplaceService.retrieveVendorOrder(vendorOrderId, {
      relations: ["earning", "items", "activities"]
    })

    if (vo.vendor_id !== vendor.id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    // Serialize helper functions
    const safeNum = (v: any): number => {
      if (v == null) return 0
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }

    const safeStr = (v: any): string => {
      if (v == null) return ""
      if (typeof v === "string") return v
      return String(v)
    }

    const items = Array.isArray(vo.items) ? vo.items : []
    const activities = Array.isArray(vo.activities) ? vo.activities : []
    const earning = vo.earning ?? null

    let formattedOrder = {
      id: safeStr(vo.id),
      order_id: safeStr(vo.order_id),
      display_id: vo.display_id ?? null,
      vendor_id: safeStr(vo.vendor_id),
      status: safeStr(vo.status || "pending"),
      vendor_fulfillment_status: safeStr(vo.status || "pending"),
      payment_status: safeStr(vo.payment_status || "awaiting_payment"),
      fulfillment_status: safeStr(vo.fulfillment_status || "not_fulfilled"),
      currency_code: safeStr(vo.currency_code || "cad"),
      item_subtotal: safeNum(vo.item_subtotal),
      commission_total: safeNum(vo.commission_total),
      vendor_net_total: safeNum(vo.vendor_net_total),
      vendor_subtotal: safeNum(vo.vendor_net_total) / 100,
      accepted_at: vo.accepted_at ?? null,
      rejected_at: vo.rejected_at ?? null,
      processing_at: vo.processing_at ?? null,
      shipped_at: vo.shipped_at ?? null,
      delivered_at: vo.delivered_at ?? null,
      rejection_reason: vo.rejection_reason ?? null,
      created_at: vo.created_at ?? new Date().toISOString(),
      updated_at: vo.updated_at ?? null,
      vendor_timestamps: {
        accepted: vo.accepted_at ?? null,
        processing: vo.processing_at ?? null,
        shipped: vo.shipped_at ?? null,
        delivered: vo.delivered_at ?? null,
      },
      items: items.map((i: any) => ({
        id: safeStr(i.line_item_id || i.id),
        vendor_order_item_id: safeStr(i.id),
        line_item_id: safeStr(i.line_item_id),
        product_id: safeStr(i.product_id),
        variant_id: safeStr(i.variant_id),
        vendor_id: safeStr(i.vendor_id),
        title: safeStr(i.title),
        sku: i.sku ?? null,
        quantity: safeNum(i.quantity),
        unit_price: safeNum(i.unit_price),
        subtotal: safeNum(i.subtotal),
        commission_amount: safeNum(i.commission_amount),
        vendor_net_amount: safeNum(i.vendor_net_amount),
        requires_shipping: i.requires_shipping !== false,
        metadata: i.metadata ?? null,
      })),
      activities: activities.map((a: any) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        notes: a.notes ?? null,
        created_at: a.created_at,
      })),
      activity_count: activities.length,
      earning: earning
        ? {
            gross_amount: safeNum(earning.gross_amount),
            commission_amount: safeNum(earning.commission_amount),
            net_amount: safeNum(earning.net_amount),
            status: safeStr(earning.status || "pending"),
          }
        : null,
      metadata: vo.metadata ?? null,
    }

    // Retrieve and merge OrderItemPersonalization data
    try {
      const personalizationService: any = req.scope.resolve("personalization")
      const itemIds = items.map((i: any) => i.line_item_id || i.id).filter(Boolean)
      if (itemIds.length > 0) {
        const orderPersonalizations = await personalizationService.listOrderItemPersonalizations({
          order_item_id: { $in: itemIds }
        })
        formattedOrder.items = formattedOrder.items.map((i: any) => {
          const match = orderPersonalizations.find((op: any) => op.order_item_id === i.id || op.order_item_id === i.vendor_order_item_id)
          if (match) {
            i.metadata = {
              ...(i.metadata || {}),
              production_status: match.metadata?.production_status || "pending_review",
              vendor_notes: match.metadata?.vendor_notes || null,
              template_version: match.metadata?.template_version || null,
              schema_hash: match.metadata?.schema_hash || null,
            }
          }
          return i
        })
      }
    } catch (e: any) {
      console.warn("Failed to load personalization info for items in GET:", e?.message || e)
    }

    // Retrieve parent order payment status
    const orderService = req.scope.resolve(Modules.ORDER)
    try {
      const parentOrder = await orderService.retrieveOrder(vo.order_id, {
        relations: ["payment_collections"]
      })

      if (parentOrder) {
        const statusSource = getPaymentStatusSource(parentOrder)
        
        let syncedStatus = "awaiting_payment"
        switch (statusSource) {
          case "captured":
            syncedStatus = "captured"
            break
          case "authorized":
            syncedStatus = "authorized"
            break
          case "pending":
          case "awaiting":
            syncedStatus = "awaiting_payment"
            break
          case "refunded":
            syncedStatus = "refunded"
            break
          case "partially_refunded":
            syncedStatus = "partially_refunded"
            break
          default:
            syncedStatus = "awaiting_payment"
        }

        if (formattedOrder.payment_status !== syncedStatus) {
          formattedOrder.payment_status = syncedStatus
          await marketplaceService.updateVendorOrders({
            id: vo.id,
            payment_status: syncedStatus
          })
          console.log(`[VENDOR_ORDERS_PAYMENT_SYNC] Single GET synced vendor order ${vo.id} payment status to ${syncedStatus}`)
        }
      }
    } catch (err: any) {
      console.warn("[VENDOR_ORDERS_PAYMENT_SYNC_SINGLE_FAILED]", err?.message || err)
    }

    // Sync fulfillment status back from native Medusa fulfillment
    try {
      formattedOrder = await syncVendorOrderFulfillmentState(req.scope, formattedOrder)
    } catch (syncErr: any) {
      console.warn(`[VENDOR_ORDERS_FULFILLMENT_SYNC_SINGLE_FAILED] order=${vo.id}`, syncErr?.message || syncErr)
    }

    // Print [VENDOR_ORDER_STATE_DEBUG] for Phase 1
    try {
      const resolved = await resolveVendorFulfillment(req.scope, vo.id)
      console.log("[VENDOR_ORDER_STATE_DEBUG]", {
        vendor_order_id: vo.id,
        stored_status: vo.status,
        stored_fulfillment_status: vo.fulfillment_status,
        native_fulfillment_id: resolved.fulfillment_id || "none",
        native_fulfillment_state: resolved.fulfillment
          ? (resolved.is_delivered ? "delivered" : resolved.is_shipped ? "shipped" : "fulfilled")
          : "none",
        parent_order_id: vo.order_id,
        frontend_list_status: vo.status,
        frontend_modal_status: formattedOrder.status
      })
    } catch (debugErr: any) {
      console.warn("[VENDOR_ORDER_STATE_DEBUG_FAILED]", debugErr?.message || debugErr)
    }

    return res.json({ order: formattedOrder })
  } catch (error: any) {
    return res.status(500).json({ message: error.message })
  }
}
