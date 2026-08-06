/**
 * Verify Vendor Order Lifecycle
 * 
 * Read-only by default. Pass --mutate=true to allow state changes.
 * 
 * Run with:
 *   npx medusa exec ./src/scripts/verify-vendor-order-lifecycle.ts
 */

import { MedusaContainer } from "@medusajs/framework"
import { MARKETPLACE_MODULE } from "../modules/marketplace/index.js"

export default async function verifyVendorOrderLifecycle({
  container,
}: {
  container: MedusaContainer
}) {
  const mutate = process.argv.includes("--mutate=true")
  console.log(`[VENDOR_LIFECYCLE_VERIFY] Starting verification (mutate=${mutate})`)

  // ── 1. Verify marketplace module resolves ──────────────────────────────
  let marketplaceService: any
  try {
    marketplaceService = container.resolve(MARKETPLACE_MODULE)
    console.log("[VENDOR_LIFECYCLE_VERIFY] ✓ Marketplace module resolved")
  } catch (err: any) {
    console.error("[VENDOR_LIFECYCLE_VERIFY] ✗ Marketplace module NOT resolved:", err?.message)
    console.error(
      "→ Run: npx medusa db:migrate\n" +
      "→ Then restart the server and re-run this script."
    )
    return
  }

  // ── 2. List all VendorOrders ───────────────────────────────────────────
  let vendorOrders: any[] = []
  try {
    vendorOrders = await marketplaceService.listVendorOrders(
      {},
      { relations: ["items", "earning"], order: { created_at: "DESC" } }
    )
    console.log(`[VENDOR_LIFECYCLE_VERIFY] ✓ Total VendorOrders in DB: ${vendorOrders.length}`)
  } catch (err: any) {
    console.error("[VENDOR_LIFECYCLE_VERIFY] ✗ listVendorOrders failed:", err?.message)
    if (/relation.*does not exist|no such table/i.test(err?.message || "")) {
      console.error(
        "→ Tables are missing. Run: npx medusa db:migrate\n" +
        "→ Then re-run this script."
      )
    }
    return
  }

  if (vendorOrders.length === 0) {
    console.warn(
      "[VENDOR_LIFECYCLE_VERIFY] ⚠ No VendorOrders found.\n" +
      "→ Run: npx medusa exec ./src/scripts/backfill-vendor-orders.ts"
    )
    return
  }

  // ── 3. Print per-order summary ─────────────────────────────────────────
  let errors = 0
  for (const vo of vendorOrders) {
    const itemCount = (vo.items || []).length
    const earning = vo.earning

    // Money formula check
    const gross = Number(vo.item_subtotal || 0)
    const commission = Number(vo.commission_total || 0)
    const net = Number(vo.vendor_net_total || 0)
    const expectedNet = gross - commission
    const moneyOk = Math.abs(net - expectedNet) < 2 // allow 1 minor-unit rounding

    if (!moneyOk) {
      console.warn(
        `[VENDOR_LIFECYCLE_VERIFY] ⚠ Money mismatch on VendorOrder ${vo.id}: ` +
        `gross=${gross} commission=${commission} net=${net} expected=${expectedNet}`
      )
      errors++
    }

    // Vendor_id must exist
    if (!vo.vendor_id) {
      console.error(`[VENDOR_LIFECYCLE_VERIFY] ✗ VendorOrder ${vo.id} has no vendor_id`)
      errors++
    }

    console.log(
      `[VENDOR_LIFECYCLE_VERIFY] VendorOrder ${vo.id.slice(0, 12)}... ` +
      `| order=${(vo.order_id || "?").slice(0, 12)}... ` +
      `| vendor=${(vo.vendor_id || "?").slice(0, 12)}... ` +
      `| status=${vo.status} ` +
      `| payment=${vo.payment_status} ` +
      `| items=${itemCount} ` +
      `| gross=${gross} commission=${commission} net=${net} ` +
      `| money_ok=${moneyOk ? "✓" : "✗"}`
    )
  }

  // ── 4. Summary ────────────────────────────────────────────────────────
  if (errors === 0) {
    console.log(`[VENDOR_LIFECYCLE_VERIFY_OK] All ${vendorOrders.length} VendorOrders verified ✓`)
  } else {
    console.warn(`[VENDOR_LIFECYCLE_VERIFY_WARN] ${errors} issue(s) found across ${vendorOrders.length} VendorOrders`)
  }
}
