import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../../../../../modules/bundle"
import { addBundleToCartWorkflow } from "../../../../../workflows/add-bundle-to-cart"

/**
 * POST /store/carts/:id/bundled-line-items
 *
 * Adds a fixed bundle to the cart using component-line representation.
 * One add operation creates one component line per bundle item, all
 * sharing the same bundle_group_id metadata.
 *
 * Body:
 *   bundle_id  — BundleDefinition ID (from GET /store/bundles/by-product/:productId)
 *   quantity   — number of bundles to add (1–100)
 *
 * The server loads all component data, pricing, and inventory itself.
 * The client must NOT send prices, component IDs, or inventory.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const cartId = req.params.id
    const { bundle_id, quantity } = req.body as { bundle_id?: string; quantity?: number }

    // Basic input validation
    if (!cartId) {
      return res.status(400).json({ code: "MISSING_CART_ID", message: "Cart ID is required" })
    }
    if (!bundle_id || typeof bundle_id !== "string") {
      return res.status(400).json({ code: "MISSING_BUNDLE_ID", message: "bundle_id is required" })
    }
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return res.status(400).json({ code: "INVALID_QUANTITY", message: "quantity must be an integer between 1 and 100" })
    }

    // Verify cart exists and is mutable before running workflow
    const locking: any = req.scope.resolve(Modules.LOCKING)

    const result = await locking.execute(`bundle-cart:${cartId}`, async () => {
      // Run the addBundleToCartWorkflow
      const { result: workflowResult } = await addBundleToCartWorkflow(req.scope).run({
        input: { cart_id: cartId, bundle_id, quantity: qty },
      })

      // Retrieve updated cart to return to client
      const cartService: any = req.scope.resolve(Modules.CART)
      const updatedCart = await cartService.retrieveCart(cartId, { relations: ["items"] })

      return { cart: updatedCart, bundle_group_id: workflowResult.bundle_group_id }
    }, { timeout: 15 })

    return res.status(200).json({
      cart: result.cart,
      bundle_group_id: result.bundle_group_id,
    })
  } catch (error: any) {
    const code = error?.code || "BUNDLE_ADD_FAILED"
    const message = error?.message || "Unable to add bundle to cart"

    if (code === "BUNDLE_COMPONENT_INSUFFICIENT_INVENTORY") {
      return res.status(422).json({
        code,
        message,
        available_quantity: error.available_quantity,
        required_quantity: error.required_quantity,
      })
    }

    if (message.includes("not found") || message.includes("not active")) {
      return res.status(404).json({ code: "BUNDLE_NOT_FOUND", message })
    }

    if (message.includes("not available in this sales channel")) {
      return res.status(422).json({ code: "BUNDLE_SALES_CHANNEL_UNAVAILABLE", message })
    }

    if (message.includes("Cart is already completed") || message.includes("Cart not found")) {
      return res.status(400).json({ code: "CART_UNAVAILABLE", message })
    }

    console.error("[bundled-line-items POST]", message)
    return res.status(500).json({ code: "BUNDLE_ADD_FAILED", message })
  }
}
