import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle"
import { getBundleGroupId } from "../modules/bundle/utils/group-id"

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function fail(message: string): never {
  throw new Error(`[bundle-snapshot-repair] ${message}`)
}

/**
 * Deliberate, opt-in legacy repair. The default is a read-only audit; only an
 * approved `--apply` creates a snapshot, after proving component identity,
 * quantity and quoted-price metadata all agree with the current bundle.
 */
export default async function repairLegacyBundleCartSnapshot({ container }: ExecArgs) {
  const cartId = argument("--cart-id") || process.env.BUNDLE_REPAIR_CART_ID
  const bundleGroupId = argument("--bundle-group-id") || process.env.BUNDLE_REPAIR_GROUP_ID
  const apply = process.argv.includes("--apply")
  if (!cartId || !bundleGroupId) fail("Usage: medusa exec ./src/scripts/repair-legacy-bundle-cart-snapshot.ts -- --cart-id <cart> --bundle-group-id <group> [--apply]")

  const cartService: any = container.resolve(Modules.CART)
  const bundleService: any = container.resolve(BUNDLE_MODULE)
  const cart = await cartService.retrieveCart(cartId, { relations: ["items"] })
  if (!cart || cart.completed_at) fail("Target cart must exist and be incomplete")

  const lines = (cart.items || []).filter((line: any) => getBundleGroupId(line) === bundleGroupId)
  if (!lines.length) fail("No bundle component lines exist for the target group")

  const snapshots = await bundleService.listBundleLineSnapshots({ cart_id: cartId })
  const existing = snapshots.filter((snapshot: any) =>
    snapshot.bundle_group_id === bundleGroupId || snapshot.metadata?.bundle_group_id === bundleGroupId
  )
  if (existing.length > 1) fail("More than one snapshot exists for this group; manual investigation is required")
  if (existing.length === 1) {
    const snapshot = existing[0]
    const report = { cart_id: cartId, bundle_group_id: bundleGroupId, action: "none", reason: "snapshot_already_exists", snapshot_id: snapshot.id, status: snapshot.status }
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const bundleIds: string[] = [...new Set<string>(lines.map((line: any) => String(line.metadata?.bundle_id || "")).filter(Boolean))]
  const bundleQuantities: number[] = [...new Set<number>(lines.map((line: any) => Number(line.metadata?.bundle_quantity || 0)))]
  if (bundleIds.length !== 1 || bundleQuantities.length !== 1 || !Number.isInteger(bundleQuantities[0]) || bundleQuantities[0] < 1) {
    fail("Component lines do not have one valid bundle ID and bundle quantity")
  }
  const bundle = await bundleService.retrieveBundleDefinition(bundleIds[0])
  if (!bundle || bundle.status !== "active") fail("Bundle definition is unavailable or inactive; do not repair this cart")

  const definitions: any[] = await bundleService.listBundleItems({ bundle_id: bundle.id }, { order: { sort_order: "ASC" } })
  const expected = new Map(definitions.map((item: any) => [item.variant_id, Number(item.quantity) * bundleQuantities[0]]))
  const actual = new Map<string, number>()
  let totalPrice = 0
  for (const line of lines) {
    const quoted = Number(line.metadata?.allocated_bundle_price_minor)
    if (!Number.isInteger(quoted) || quoted < 0) fail("Line pricing metadata is incomplete or non-integer; do not reconstruct a price")
    totalPrice += quoted
    actual.set(line.variant_id, (actual.get(line.variant_id) || 0) + Number(line.quantity || 0))
  }
  const quantitiesMatch = expected.size === actual.size && [...expected].every(([variantId, quantity]) => actual.get(variantId) === quantity)
  if (!quantitiesMatch || totalPrice <= 0) fail("Component identities, quantities, or quoted price do not match the bundle definition")

  const snapshotInput = {
    cart_id: cartId,
    bundle_group_id: bundleGroupId,
    status: "active" as const,
    cart_line_item_id: lines[0].id,
    bundle_id: bundle.id,
    component_snapshot: {
      bundle_title: bundle.title,
      bundle_handle: bundle.handle,
      bundle_group_id: bundleGroupId,
      components: definitions.map((item: any) => ({ variant_id: item.variant_id, quantity_per_bundle: Number(item.quantity), total_quantity: Number(item.quantity) * bundleQuantities[0] })),
    },
    bundle_price_snapshot: {
      unit_price: totalPrice / bundleQuantities[0],
      total_price: totalPrice,
      currency_code: cart.currency_code,
      repaired_from_legacy_lines: true,
    },
    reservation_status: "none" as const,
    metadata: { bundle_group_id: bundleGroupId, all_line_ids: lines.map((line: any) => line.id), repaired_at: new Date().toISOString() },
  }
  const report = { cart_id: cartId, bundle_group_id: bundleGroupId, action: apply ? "create_snapshot" : "dry_run", bundle_id: bundle.id, line_ids: snapshotInput.metadata.all_line_ids, total_price_minor: totalPrice }
  if (!apply) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const created = await bundleService.createBundleLineSnapshots(snapshotInput)
  console.log(JSON.stringify({ ...report, snapshot_id: created.id }, null, 2))
}
