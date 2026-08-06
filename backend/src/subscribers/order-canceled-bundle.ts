import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle"
import { isCommerceFeatureEnabled } from "../lib/commerce-feature-flags"

export default async function restoreCanceledBundle({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  if (!isCommerceFeatureEnabled("bundled_products")) return
  const service: any = container.resolve(BUNDLE_MODULE)
  const inventory: any = container.resolve(Modules.INVENTORY)
  const locking: any = container.resolve(Modules.LOCKING)
  const snapshots = await service.listBundleLineSnapshots({ order_id: data.id, reservation_status: "committed" })
  for (const snapshot of snapshots) {
    await locking.execute(`bundle-restore:${snapshot.id}`, async () => {
      const current = await service.retrieveBundleLineSnapshot(snapshot.id)
      if (current.reservation_status !== "committed") return
      for (const deduction of current.component_snapshot?.inventory_deductions || []) {
        await inventory.adjustInventory(deduction.level_id, { inventory_item_id: deduction.inventory_item_id, location_id: deduction.location_id, adjustment: Number(deduction.quantity) })
      }
      await service.updateBundleLineSnapshots({ id: current.id, status: "voided", reservation_status: "restored" })
    }, { timeout: 15 })
  }
}

export const config: SubscriberConfig = { event: "order.canceled" }
