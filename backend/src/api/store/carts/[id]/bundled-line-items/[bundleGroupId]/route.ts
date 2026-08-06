import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../../../../../../modules/bundle"
import { getBundleGroupId } from "../../../../../../modules/bundle/utils/group-id"

/**
 * DELETE /store/carts/:id/bundled-line-items/:bundleGroupId
 *
 * Atomically removes all cart lines sharing the given bundle_group_id.
 * Releases associated inventory reservations and removes the BundleLineSnapshot.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  try {
    const cartId = req.params.id
    const bundleGroupId = req.params.bundleGroupId

    if (!cartId || !bundleGroupId) {
      return res.status(400).json({ code: "MISSING_PARAMS", message: "cart ID and bundleGroupId are required" })
    }

    const locking: any = req.scope.resolve(Modules.LOCKING)

    const result = await locking.execute(`bundle-cart:${cartId}`, async () => {
      const cartService: any = req.scope.resolve(Modules.CART)
      const cart = await cartService.retrieveCart(cartId, { relations: ["items"] })

      if (!cart) throw new Error("Cart not found")
      if (cart.completed_at) throw new Error("Cart is already completed")

      // Find all lines belonging to this bundle group
      const bundleLines = (cart.items || []).filter((item: any) => getBundleGroupId(item) === bundleGroupId)

      if (!bundleLines.length) {
        return { removed: 0, cart }
      }

      const lineIds = bundleLines.map((line: any) => line.id)

      // Find and clean up bundle snapshot
      const bundleService: any = req.scope.resolve(BUNDLE_MODULE)
      const matchingSnapshots = await bundleService.listBundleLineSnapshots({ cart_id: cartId, bundle_group_id: bundleGroupId })

      // Release inventory reservations
      const inventoryService: any = req.scope.resolve(Modules.INVENTORY)
      for (const snapshot of matchingSnapshots) {
        const reservationIds = snapshot.reservation_ids || []
        if (reservationIds.length) {
          await inventoryService.deleteReservationItems(reservationIds).catch(() => undefined)
        }
      }

      // Delete snapshots
      if (matchingSnapshots.length) {
        const snapshotIds = matchingSnapshots.map((s: any) => s.id)
        await bundleService.deleteBundleLineSnapshots(snapshotIds).catch(() => undefined)
      }

      // Remove all bundle component lines
      for (const lineId of lineIds) {
        await cartService.deleteLineItems([lineId]).catch(() => undefined)
      }

      const updatedCart = await cartService.retrieveCart(cartId, { relations: ["items"] })
      return { removed: lineIds.length, cart: updatedCart }
    }, { timeout: 10 })

    return res.status(200).json({
      removed: result.removed,
      cart: result.cart,
    })
  } catch (error: any) {
    const msg = String(error?.message || "Failed to remove bundle")
    if (msg.includes("Cart not found")) {
      return res.status(404).json({ code: "CART_NOT_FOUND", message: msg })
    }
    console.error("[bundled-line-items DELETE]", msg)
    return res.status(500).json({ code: "BUNDLE_REMOVE_FAILED", message: msg })
  }
}
