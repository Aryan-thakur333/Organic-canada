import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { Modules } from "@medusajs/framework/utils"
import { syncVendorOrderFulfillmentState } from "../../../utils/marketplace/sync-vendor-fulfillment-state"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // ── AUTH CHECK ──────────────────────────────────────────────────────────
  const vendor = (req as any).vendor
  console.log("[VENDOR_ORDERS_GET_REACHED]", {
    time: new Date().toISOString(),
    vendorId: vendor?.id ?? null,
    vendorStatus: vendor?.status ?? null,
  })

  if (!vendor?.id) {
    return res.status(401).json({ orders: [], count: 0, message: "Authentication required" })
  }

  // ── SERVICE RESOLUTION ──────────────────────────────────────────────────
  let marketplaceService: any
  try {
    marketplaceService = req.scope.resolve(MARKETPLACE_MODULE)
    console.log("[VENDOR_ORDERS_SERVICE_RESOLVED]", { exists: !!marketplaceService })
  } catch (resolveErr: any) {
    console.error("[VENDOR_ORDERS_SERVICE_MISSING]", resolveErr?.message)
    return res.status(503).json({
      orders: [],
      count: 0,
      message: "Marketplace service unavailable. Run db:migrate to create tables.",
    })
  }

  // ── QUERY ───────────────────────────────────────────────────────────────
  try {
    console.log("[VENDOR_ORDERS_QUERY_START]", { vendor_id: vendor.id })

    // MedusaService listAndCount: first arg = filters, second = config (skip, take, relations, order)
    const limit = 20
    const offset = 0
    let vendorOrders: any[] = []
    let totalCount = 0

    try {
      const [orders, count] = await marketplaceService.listAndCountVendorOrders(
        { vendor_id: vendor.id },
        {
          skip: offset,
          take: limit,
          order: { created_at: "DESC" },
          relations: ["earning", "items", "activities"],
        }
      )
      vendorOrders = orders
      totalCount = count
    } catch (listErr: any) {
      // If relations fail (table doesn't exist or schema mismatch), try without relations
      console.warn("[VENDOR_ORDERS_RELATIONS_FAILED]", listErr?.message, "— retrying without relations")
      try {
        const [orders, count] = await marketplaceService.listAndCountVendorOrders(
          { vendor_id: vendor.id },
          { skip: offset, take: limit, order: { created_at: "DESC" } }
        )
        vendorOrders = orders
        totalCount = count
      } catch (innerErr: any) {
        console.error("[VENDOR_ORDERS_QUERY_FAILED]", {
          message: innerErr?.message,
          stack: innerErr?.stack,
        })
        return res.status(500).json({
          orders: [],
          count: 0,
          limit,
          offset,
          code: "VENDOR_ORDERS_QUERY_FAILED",
          message:
            process.env.NODE_ENV === "development"
              ? innerErr?.message
              : "Unable to load vendor orders. Please run database migration.",
        })
      }
    }

    console.log("[VENDOR_ORDERS_QUERY_RESULT]", { count: totalCount })

    // ── SERIALIZE ──────────────────────────────────────────────────────────
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

    const formattedOrders = (vendorOrders || []).map((o: any) => {
      const items = Array.isArray(o.items) ? o.items : []
      const activities = Array.isArray(o.activities) ? o.activities : []
      const earning = o.earning ?? null

      return {
        id: safeStr(o.id),
        order_id: safeStr(o.order_id),
        display_id: o.display_id ?? null,
        vendor_id: safeStr(o.vendor_id),

        // Status fields
        status: safeStr(o.status || "pending"),
        vendor_fulfillment_status: safeStr(o.status || "pending"), // UI compat
        
        // This payment_status will be overwritten below if parent exists, else fallback
        payment_status: safeStr(o.payment_status || "awaiting_payment"),
        fulfillment_status: safeStr(o.fulfillment_status || "not_fulfilled"),

        // Money — always minor units
        currency_code: safeStr(o.currency_code || "cad"),
        item_subtotal: safeNum(o.item_subtotal),
        commission_total: safeNum(o.commission_total),
        vendor_net_total: safeNum(o.vendor_net_total),

        // Legacy compat (frontend expects vendor_subtotal in dollars divided)
        vendor_subtotal: safeNum(o.vendor_net_total) / 100,

        // Timestamps
        accepted_at: o.accepted_at ?? null,
        rejected_at: o.rejected_at ?? null,
        processing_at: o.processing_at ?? null,
        shipped_at: o.shipped_at ?? null,
        delivered_at: o.delivered_at ?? null,
        rejection_reason: o.rejection_reason ?? null,
        created_at: o.created_at ?? new Date().toISOString(),
        updated_at: o.updated_at ?? null,

        // UI timeline compat
        vendor_timestamps: {
          accepted: o.accepted_at ?? null,
          processing: o.processing_at ?? null,
          shipped: o.shipped_at ?? null,
          delivered: o.delivered_at ?? null,
        },

        // Items
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

        // Activity count only (don't leak full activity list by default)
        activity_count: activities.length,

        // Earning summary
        earning: earning
          ? {
              gross_amount: safeNum(earning.gross_amount),
              commission_amount: safeNum(earning.commission_amount),
              net_amount: safeNum(earning.net_amount),
              status: safeStr(earning.status || "pending"),
            }
          : null,

        metadata: o.metadata ?? null,
      }
    })

    // ── NATIVE PAYMENT STATUS SYNC (Phase 4) ──────────────────────────────
    const orderService = req.scope.resolve(Modules.ORDER)
    const orderIds = [...new Set(formattedOrders.map(o => o.order_id).filter(Boolean))]
    
    let parentOrdersMap: Record<string, any> = {}
    if (orderIds.length > 0) {
      try {
        const parentOrders = await orderService.listOrders(
          { id: orderIds },
          { relations: ["payment_collections"] }
        )
        parentOrders.forEach((po: any) => {
          parentOrdersMap[po.id] = po
        })
      } catch (err: any) {
        console.warn("[VENDOR_ORDERS_PAYMENT_SYNC_FAILED]", err?.message || err)
      }
    }

    const finalOrders = await Promise.all(formattedOrders.map(async (o) => {
      const parent = parentOrdersMap[o.order_id]
      if (parent) {
        const pc = parent.payment_collections?.[0]
        const statusSource = pc?.status || parent.payment_status
        
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

        if (o.payment_status !== syncedStatus) {
          o.payment_status = syncedStatus
          try {
            await marketplaceService.updateVendorOrders({
              id: o.id,
              payment_status: syncedStatus
            })
            console.log(`[VENDOR_ORDERS_PAYMENT_SYNC] Synced vendor order ${o.id} payment status to ${syncedStatus}`)
          } catch (err: any) {
            console.warn(`[VENDOR_ORDERS_PAYMENT_SYNC_SAVE_FAILED] order=${o.id}`, err?.message || err)
          }
        }
      }

      // Sync fulfillment status back from native Medusa fulfillment
      try {
        o = await syncVendorOrderFulfillmentState(req.scope, o)
      } catch (syncErr: any) {
        console.warn(`[VENDOR_ORDERS_FULFILLMENT_SYNC_FAILED] order=${o.id}`, syncErr?.message || syncErr)
      }

      return o
    }))

    return res.json({
      orders: finalOrders,
      count: finalOrders.length,
      limit: 50,
      offset: 0,
    })
  } catch (error: any) {
    console.error("[VENDOR_ORDERS_GET_ERROR]", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    })

    return res.status(500).json({
      orders: [],
      count: 0,
      code: "VENDOR_ORDERS_GET_FAILED",
      message:
        process.env.NODE_ENV === "development"
          ? error?.message
          : "Unable to load vendor orders.",
    })
  }
}
