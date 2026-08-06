import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle"
import { isCommerceFeatureEnabled } from "../lib/commerce-feature-flags"

export default async function commitBundleReservations({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  if (!isCommerceFeatureEnabled("bundled_products")) return
  const query: any = container.resolve("query")
  const { data: orders } = await query.graph({ entity: "order", fields: ["id", "cart.id", "items.id", "items.variant_id", "items.metadata"], filters: { id: data.id } })
  const order = orders[0]
  const cartId = order?.cart?.id
  if (!order || !cartId) return
  const service: any = container.resolve(BUNDLE_MODULE)
  const inventory: any = container.resolve(Modules.INVENTORY)
  const locking: any = container.resolve(Modules.LOCKING)
  const snapshots = await service.listBundleLineSnapshots({ cart_id: cartId })
  for (const snapshot of snapshots) {
    await locking.execute(`bundle-commit:${snapshot.id}`, async () => {
      const current = await service.retrieveBundleLineSnapshot(snapshot.id)
      if (current.reservation_status === "committed") return
      if (current.reservation_status !== "reserved") throw new Error(`Bundle reservation ${current.id} was not established before order creation`)
      const ids = current.reservation_ids || []
      const reservations = ids.length ? await inventory.listReservationItems({ id: ids }) : []
      if (reservations.length !== ids.length) throw new Error(`Bundle reservation records are incomplete for ${current.id}`)
      const deductions: any[] = []
      try {
        for (const reservation of reservations) {
          const levels = await inventory.listInventoryLevels({ inventory_item_id: reservation.inventory_item_id, location_id: reservation.location_id })
          const level = levels[0]
          if (!level) throw new Error("Reserved component inventory level no longer exists")
          await inventory.adjustInventory(level.id, { inventory_item_id: reservation.inventory_item_id, location_id: reservation.location_id, adjustment: -Number(reservation.quantity) })
          deductions.push({ level_id: level.id, inventory_item_id: reservation.inventory_item_id, location_id: reservation.location_id, quantity: Number(reservation.quantity) })
        }
      } catch (error) {
        for (const deduction of deductions.reverse()) await inventory.adjustInventory(deduction.level_id, { inventory_item_id: deduction.inventory_item_id, location_id: deduction.location_id, adjustment: deduction.quantity }).catch(() => undefined)
        throw error
      }
      if (ids.length) await inventory.deleteReservationItems(ids)
      const orderLine = order.items?.find((item: any) => item.metadata?.bundle_id === current.bundle_id)
      await service.updateBundleLineSnapshots({
        id: current.id, order_id: order.id, order_line_item_id: orderLine?.id || null,
        status: "converted", reservation_status: "committed", reservation_ids: null,
        component_snapshot: { ...(current.component_snapshot || {}), inventory_deductions: deductions },
      })
    }, { timeout: 15 })
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
