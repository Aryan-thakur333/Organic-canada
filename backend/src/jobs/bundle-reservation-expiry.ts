import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle"
import { isCommerceFeatureEnabled } from "../lib/commerce-feature-flags"

export default async function releaseStaleBundleReservations(container: MedusaContainer) {
  if (!isCommerceFeatureEnabled("bundled_products")) return
  const service: any = container.resolve(BUNDLE_MODULE)
  const inventory: any = container.resolve(Modules.INVENTORY)
  const cartService: any = container.resolve(Modules.CART)
  const locking: any = container.resolve(Modules.LOCKING)
  const cutoff = Date.now() - 30 * 60 * 1000
  const snapshots = await service.listBundleLineSnapshots({ reservation_status: "reserved" }, { take: 1000 })
  for (const snapshot of snapshots.filter((item: any) => new Date(item.updated_at).getTime() < cutoff)) {
    await locking.execute(`bundle-expire:${snapshot.id}`, async () => {
      const current = await service.retrieveBundleLineSnapshot(snapshot.id)
      if (current.reservation_status !== "reserved") return
      try {
        const cart = current.cart_id ? await cartService.retrieveCart(current.cart_id) : null
        if (cart?.completed_at) return
      } catch { /* a missing cart is safe to release */ }
      const ids = current.reservation_ids || []
      if (ids.length) await inventory.deleteReservationItems(ids)
      await service.updateBundleLineSnapshots({ id: current.id, reservation_ids: null, reservation_status: "released" })
    }, { timeout: 10 })
  }
}

export const config = { name: "bundle-reservation-expiry", schedule: "*/10 * * * *" }
