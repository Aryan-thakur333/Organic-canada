import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// ── Types ──────────────────────────────────────────────────────────────────

type ErpOrderLinePayload = {
  sku: string
  title: string
  quantity: number
  unit_price_cents: number
  unit_price_currency: string
  total_cents: number
  vendor_id: string | null
  vendor_name: string | null
  commission_rate: number       // e.g. 0.10 = 10%
  commission_cents: number
  tax_rate: number
  tax_cents: number
}

type ErpOrderPayload = {
  erp_sync_version: string
  synced_at: string
  order: {
    id: string
    display_id: number | null
    status: string
    currency_code: string
    total_cents: number
    subtotal_cents: number
    tax_cents: number
    shipping_cents: number
    discount_cents: number
    customer_email: string | null
    customer_id: string | null
    shipping_address: Record<string, unknown> | null
    billing_address: Record<string, unknown> | null
  }
  line_items: ErpOrderLinePayload[]
  vendor_summary: Array<{
    vendor_id: string
    vendor_name: string
    item_count: number
    subtotal_cents: number
    commission_cents: number
    tax_cents: number
  }>
  tax_breakdown: {
    total_tax_cents: number
    by_rate: Record<string, number>  // rate -> amount in cents
  }
  commission_summary: {
    total_commission_cents: number
    vendor_count: number
    platform_revenue_cents: number   // total - commissions
  }
  destination: string | null         // ERP system name, e.g. "zoho", "odoo"
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolves commission rates for each vendor.
 * In production, fetch these from a VendorModule setting or a dedicated commission table.
 */
function getCommissionRate(_vendorId: string): number {
  // Default flat 10% commission. Replace with per-vendor lookup.
  return 0.10
}

/**
 * Builds a complete ERP-ready payload from a Medusa order.
 */
async function buildErpPayload(
  order: any,
  query: any,
  destination: string | null
): Promise<ErpOrderPayload> {
  const currency = order.currency_code ?? "eur"
  const items = order.items ?? []

  // ── Resolve vendor info for each product ───────────────────────────────
  const productIds = [...new Set(items.map((i: any) => i.product_id).filter(Boolean))]
  const vendorMap = new Map<string, { id: string; name: string }>()

  if (productIds.length > 0) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "vendor.id", "vendor.store_name"],
      filters: { id: productIds },
    })
    for (const p of products) {
      if (p.vendor?.id) {
        vendorMap.set(p.id, {
          id: p.vendor.id,
          name: p.vendor.store_name ?? p.vendor.id,
        })
      }
    }
  }

  // ── Build line items with commission & tax ─────────────────────────────
  const lineItems: ErpOrderLinePayload[] = items.map((item: any) => {
    const vendor = item.product_id ? vendorMap.get(item.product_id) : null
    const unitPrice = item.unit_price ?? 0
    const quantity = item.quantity ?? 1
    const total = unitPrice * quantity
    const commissionRate = vendor ? getCommissionRate(vendor.id) : 0
    const commissionCents = Math.round(total * commissionRate)
    // Default tax assumption — in production, fetch from order.tax_lines
    const taxRate = 0.05
    const taxCents = Math.round(total * taxRate)

    return {
      sku: item.variant_sku ?? item.id?.slice(-8) ?? "",
      title: item.title ?? "Unknown",
      quantity,
      unit_price_cents: unitPrice,
      unit_price_currency: currency,
      total_cents: total,
      vendor_id: vendor?.id ?? null,
      vendor_name: vendor?.name ?? null,
      commission_rate: commissionRate,
      commission_cents: commissionCents,
      tax_rate: taxRate,
      tax_cents: taxCents,
    }
  })

  // ── Aggregate vendor summaries ─────────────────────────────────────────
  const vendorBuckets = new Map<string, {
    vendor_id: string
    vendor_name: string
    item_count: number
    subtotal_cents: number
    commission_cents: number
    tax_cents: number
  }>()

  for (const li of lineItems) {
    if (!li.vendor_id) continue
    let bucket = vendorBuckets.get(li.vendor_id)
    if (!bucket) {
      bucket = {
        vendor_id: li.vendor_id,
        vendor_name: li.vendor_name ?? li.vendor_id,
        item_count: 0,
        subtotal_cents: 0,
        commission_cents: 0,
        tax_cents: 0,
      }
      vendorBuckets.set(li.vendor_id, bucket)
    }
    bucket.item_count += li.quantity
    bucket.subtotal_cents += li.total_cents
    bucket.commission_cents += li.commission_cents
    bucket.tax_cents += li.tax_cents
  }

  // ── Tax breakdown ─────────────────────────────────────────────────────
  const taxByRate: Record<string, number> = {}
  for (const li of lineItems) {
    const key = `${(li.tax_rate * 100).toFixed(1)}%`
    taxByRate[key] = (taxByRate[key] ?? 0) + li.tax_cents
  }

  const totalCommissionCents = lineItems.reduce((s, li) => s + li.commission_cents, 0)
  const totalTaxCents = lineItems.reduce((s, li) => s + li.tax_cents, 0)

  const payload: ErpOrderPayload = {
    erp_sync_version: "1.0.0",
    synced_at: new Date().toISOString(),
    order: {
      id: order.id,
      display_id: order.display_id ?? null,
      status: order.status,
      currency_code: currency,
      total_cents: order.total ?? 0,
      subtotal_cents: (order.items ?? []).reduce(
        (s: number, i: any) => s + (i.unit_price ?? 0) * (i.quantity ?? 1), 0
      ),
      tax_cents: totalTaxCents,
      shipping_cents: order.shipping_total ?? 0,
      discount_cents: order.discount_total ?? 0,
      customer_email: order.email ?? null,
      customer_id: order.customer_id ?? null,
      shipping_address: order.shipping_address ?? null,
      billing_address: order.billing_address ?? null,
    },
    line_items: lineItems,
    vendor_summary: Array.from(vendorBuckets.values()),
    tax_breakdown: {
      total_tax_cents: totalTaxCents,
      by_rate: taxByRate,
    },
    commission_summary: {
      total_commission_cents: totalCommissionCents,
      vendor_count: vendorBuckets.size,
      platform_revenue_cents: (order.total ?? 0) - totalCommissionCents,
    },
    destination,
  }

  return payload
}

/**
 * Dispatches the ERP payload to the configured pipeline.
 * Replace this mock with actual HTTP calls to Zoho, Odoo, SAP, etc.
 */
async function dispatchToErp(
  payload: ErpOrderPayload,
  destination: string | null
): Promise<{ success: boolean; external_id: string | null }> {
  console.log(`[ERPSync] Dispatching to ${destination ?? "mock"}...`)
  console.log(`[ERPSync] Payload:`, JSON.stringify(payload, null, 2))

  // Simulate successful external sync
  return {
    success: true,
    external_id: `ERP-${Date.now().toString(36).toUpperCase()}`,
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /store/b2b/erp-sync
 *
 * Health-check endpoint — returns the current ERP sync configuration.
 */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json({
    service: "ERP Integration Bridge",
    version: "1.0.0",
    status: "operational",
    supported_destinations: ["zoho", "odoo", "sap", "mock"],
    endpoints: {
      health: "GET /store/b2b/erp-sync",
      sync_order: "POST /store/b2b/erp-sync",
    },
  })
}

/**
 * POST /store/b2b/erp-sync
 *
 * Accepts an order_id and ERP destination, fetches the full order with
 * vendor commissions and tax breakdowns, and dispatches a structured
 * payload to the external ERP pipeline.
 *
 * Request body:
 * {
 *   "order_id": "ord_01J...",
 *   "destination": "zoho"           // optional, defaults to "mock"
 * }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { order_id, destination } = req.body as {
    order_id?: string
    destination?: string
  }

  if (!order_id) {
    return res.status(400).json({ message: "order_id is required" })
  }

  try {
    const query = req.scope.resolve("query")

    // ── 1. Fetch the complete order ───────────────────────────────────────
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "status",
        "email",
        "currency_code",
        "total",
        "shipping_total",
        "discount_total",
        "customer_id",
        "items.id",
        "items.product_id",
        "items.title",
        "items.quantity",
        "items.unit_price",
        "items.variant_sku",
        "shipping_address.*",
        "billing_address.*",
      ],
      filters: { id: order_id },
    })

    const order = orders?.[0]
    if (!order) {
      return res.status(404).json({ message: `Order "${order_id}" not found` })
    }

    // ── 2. Build the ERP payload ─────────────────────────────────────────
    const payload = await buildErpPayload(
      order,
      query,
      destination ?? "mock"
    )

    // ── 3. Dispatch to ERP pipeline ──────────────────────────────────────
    const erpResult = await dispatchToErp(payload, destination ?? null)

    // ── 4. Response ──────────────────────────────────────────────────────
    res.status(201).json({
      message: `Order synced to ERP (${destination ?? "mock"})`,
      sync: erpResult,
      order_id: order.id,
      vendor_count: payload.vendor_summary.length,
      total_commission_cents: payload.commission_summary.total_commission_cents,
      total_tax_cents: payload.tax_breakdown.total_tax_cents,
      synced_at: payload.synced_at,
    })
  } catch (error: any) {
    console.error("[ERPSync] Error:", error)
    return res.status(500).json({
      message: error.message || "Failed to sync order to ERP",
    })
  }
}
