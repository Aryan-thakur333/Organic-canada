import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from ".."
import { loadBundleOperationalContext } from "./availability"
import { getBundleGroupId } from "./group-id"
import { getActiveCartBundleSnapshot, validateCartBundleSnapshot, BundleSnapshotIntegrityError } from "./snapshot-integrity"

/**
 * Reserves inventory for all bundle groups in the cart at checkout time.
 * Works with the component-line representation where groups are identified
 * by bundle_group_id metadata on each component line.
 */
export async function reserveBundleCartComponents(scope: any, cartId: string) {
  const locking: any = scope.resolve(Modules.LOCKING)
  return locking.execute(`bundle-checkout:${cartId}`, async () => {
    const cartService: any = scope.resolve(Modules.CART)
    const cart = await cartService.retrieveCart(cartId, { relations: ["items"] })
    // Completion retries are handled by the completion route's idempotent
    // order lookup. Never attempt fresh reservations on a completed cart.
    if (cart.completed_at) return []

    // Find all bundle component lines
    const componentLines = (cart.items || []).filter(
      (item: any) =>
        item.metadata?.commerce_type === "FIXED_BUNDLE_COMPONENT" &&
        getBundleGroupId(item)
    )

    // Legacy single-line bundles (metadata.is_bundle === true)
    const legacyBundleLines = (cart.items || []).filter(
      (item: any) =>
        item.metadata?.is_bundle === true &&
        !item.metadata?.commerce_type
    )

    if (!componentLines.length && !legacyBundleLines.length) return []

    const bundleService: any = scope.resolve(BUNDLE_MODULE)
    const inventoryService: any = scope.resolve(Modules.INVENTORY)
    const reservedSnapshots: any[] = []
    const newlyReservedSnapshots: any[] = []

    // ── Component-line representation ──────────────────────────────────────────
    // Group by bundle_group_id
    const bundleGroups = new Map<string, { lines: any[]; bundleId: string; bundleQuantity: number }>()
    for (const line of componentLines) {
      const bgId = getBundleGroupId(line)!
      if (!bundleGroups.has(bgId)) {
        bundleGroups.set(bgId, {
          lines: [],
          bundleId: line.metadata.bundle_id,
          bundleQuantity: Number(line.metadata.bundle_quantity || 1),
        })
      }
      bundleGroups.get(bgId)!.lines.push(line)
    }

    try {
      for (const [bundleGroupId, group] of bundleGroups) {
        const { snapshot, bundle } = await getActiveCartBundleSnapshot({ scope, cartId, bundleGroupId })
        validateCartBundleSnapshot({ cart, bundleGroupId, snapshot })
        if (snapshot.reservation_status === "reserved") {
          if (!Array.isArray(snapshot.reservation_ids) || snapshot.reservation_ids.length === 0) {
            throw new BundleSnapshotIntegrityError("BUNDLE_RESERVATION_MISMATCH", `Bundle reservation is incomplete for group ${bundleGroupId}.`, { cart_id: cartId, bundle_group_id: bundleGroupId })
          }
          reservedSnapshots.push(snapshot)
          continue
        }
        if (snapshot.reservation_status === "committed") continue

        if (bundle.status !== "active") throw new Error(`Bundle ${bundle.title} is no longer active`)

        // Validate current regional inventory
        const operational = await loadBundleOperationalContext(scope, bundle, group.bundleQuantity, {
          sales_channel_id: cart.sales_channel_id,
          country_code: snapshot.metadata?.country_code,
        })
        if (!operational.can_fulfill) {
          throw new Error(`Insufficient regional component inventory for ${bundle.title}`)
        }

        // Create inventory reservations using first component line as anchor
        const primaryLineId = group.lines[0]?.id || snapshot.cart_line_item_id
        const inputs = operational.selected_location.allocations.map((allocation: any) => ({
          line_item_id: primaryLineId,
          inventory_item_id: allocation.inventory_item_id,
          location_id: allocation.location_id,
          quantity: allocation.quantity_per_bundle * group.bundleQuantity,
          allow_backorder: false,
          created_by: "bundle-checkout",
          external_id: snapshot.id,
          description: `Bundle component reservation for ${bundle.title}`,
          metadata: { bundle_id: bundle.id, bundle_group_id: bundleGroupId, bundle_snapshot_id: snapshot.id, variant_id: allocation.variant_id },
        }))

        const reservations = inputs.length ? await inventoryService.createReservationItems(inputs) : []
        const updated = await bundleService.updateBundleLineSnapshots({
          id: snapshot.id,
          reservation_ids: reservations.map((r: any) => r.id),
          reservation_status: "reserved",
          component_snapshot: {
            ...(snapshot.component_snapshot || {}),
            selected_location_id: operational.selected_location.location_id,
            inventory_allocations: inputs.map((input: any) => ({
              inventory_item_id: input.inventory_item_id,
              location_id: input.location_id,
              quantity: input.quantity,
              variant_id: input.metadata.variant_id,
            })),
          },
        })
        reservedSnapshots.push(Array.isArray(updated) ? updated[0] : updated)
        newlyReservedSnapshots.push(Array.isArray(updated) ? updated[0] : updated)
      }

      // ── Legacy single-line bundles (backward compat) ───────────────────────
      for (const line of legacyBundleLines) {
        const snapshots = await bundleService.listBundleLineSnapshots({ cart_line_item_id: line.id })
        const snapshot = snapshots[0]
        if (!snapshot) throw new Error(`Bundle snapshot missing for cart line ${line.id}`)
        if (snapshot.reservation_status === "reserved") { reservedSnapshots.push(snapshot); continue }
        if (snapshot.reservation_status === "committed") continue
        const bundle = await bundleService.retrieveBundleDefinition(snapshot.bundle_id)
        if (bundle.status !== "active") throw new Error("Bundle is no longer active")
        const operational = await loadBundleOperationalContext(scope, bundle, Number(line.quantity), {
          sales_channel_id: cart.sales_channel_id,
          country_code: snapshot.metadata?.country_code,
        })
        if (!operational.can_fulfill) throw new Error(`Insufficient regional component inventory for ${bundle.title}`)
        const inputs = operational.selected_location.allocations.map((allocation: any) => ({
          line_item_id: line.id,
          inventory_item_id: allocation.inventory_item_id,
          location_id: allocation.location_id,
          quantity: allocation.quantity_per_bundle * Number(line.quantity),
          allow_backorder: false,
          created_by: "bundle-checkout",
          external_id: snapshot.id,
          description: `Bundle component reservation for ${bundle.title}`,
          metadata: { bundle_id: bundle.id, bundle_snapshot_id: snapshot.id, variant_id: allocation.variant_id },
        }))
        const reservations = inputs.length ? await inventoryService.createReservationItems(inputs) : []
        const updated = await bundleService.updateBundleLineSnapshots({
          id: snapshot.id,
          reservation_ids: reservations.map((r: any) => r.id),
          reservation_status: "reserved",
          component_snapshot: {
            ...(snapshot.component_snapshot || {}),
            selected_location_id: operational.selected_location.location_id,
            inventory_allocations: inputs.map((input: any) => ({
              inventory_item_id: input.inventory_item_id,
              location_id: input.location_id,
              quantity: input.quantity,
              variant_id: input.metadata.variant_id,
            })),
          },
        })
        reservedSnapshots.push(Array.isArray(updated) ? updated[0] : updated)
      }

      return reservedSnapshots
    } catch (error) {
      // Rollback all reservations created in this attempt
      for (const snapshot of newlyReservedSnapshots) {
        if (snapshot.reservation_status !== "reserved") continue
        const ids = snapshot.reservation_ids || []
        if (ids.length) await inventoryService.deleteReservationItems(ids).catch(() => undefined)
        await bundleService.updateBundleLineSnapshots({ id: snapshot.id, reservation_ids: null, reservation_status: "released" }).catch(() => undefined)
      }
      throw error
    }
  }, { timeout: 15 })
}

export async function releaseBundleCartReservations(scope: any, cartId: string) {
  const service: any = scope.resolve(BUNDLE_MODULE)
  const inventoryService: any = scope.resolve(Modules.INVENTORY)
  const snapshots = await service.listBundleLineSnapshots({ cart_id: cartId, reservation_status: "reserved" })
  for (const snapshot of snapshots) {
    const ids = snapshot.reservation_ids || []
    if (ids.length) await inventoryService.deleteReservationItems(ids)
    await service.updateBundleLineSnapshots({ id: snapshot.id, reservation_ids: null, reservation_status: "released" })
  }
}
