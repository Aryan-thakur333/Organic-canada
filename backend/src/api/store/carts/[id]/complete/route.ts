import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { completeCartWorkflow } from "@medusajs/core-flows"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { convertCartBundleSnapshotsToOrder, findOrderForCart } from "../../../../../utils/order-cart"

/**
 * Completes a cart under a cart-scoped lock. Retrying this endpoint never
 * creates a new payment session; it either returns the existing order or
 * performs the one native completion attempt that has not yet succeeded.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id: cartId } = req.params
  if (!cartId) return res.status(400).json({ code: "CART_ID_REQUIRED", message: "Cart ID is required" })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const locking: any = req.scope.resolve(Modules.LOCKING)

  try {
    const response = await locking.execute(`cart-completion:${cartId}`, async () => {
      const existing = await findOrderForCart({ query, cartId })
      if (existing.order) {
        await convertCartBundleSnapshotsToOrder({ scope: req.scope, query, cartId, orderId: existing.order.id })
        return { type: "order", order: existing.order, reused: true, lookup_source: existing.lookupSource }
      }

      const { data: carts } = await query.graph({
        entity: "cart",
        fields: [
          "id", "completed_at", "customer_id", "total", "payment_collection.id",
          "payment_collection.payment_sessions.id", "payment_collection.payment_sessions.provider_id",
          "payment_collection.payment_sessions.status",
        ],
        filters: { id: cartId },
      })
      const cart = carts?.[0]
      if (!cart) {
        const error: any = new Error("Cart not found")
        error.code = "CART_NOT_FOUND"
        error.status = 404
        throw error
      }
      if (cart.completed_at) {
        const error: any = new Error("Cart is already completed; its order is still being indexed. Retry shortly without paying again.")
        error.code = "CART_COMPLETION_PENDING"
        error.status = 409
        throw error
      }

      console.log("[B2C_COMPLETE_START]", {
        cart_id: cartId,
        customer_id: cart.customer_id,
        total: cart.total,
        payment_collection_id: cart.payment_collection?.id,
      })

      const { result, errors } = await completeCartWorkflow(req.scope).run({
        input: { id: cartId },
        throwOnError: true,
      })
      if (errors?.length) throw errors[0].error || new Error("Cart completion workflow failed")

      // completeCartWorkflow creates the supported `order_cart` link atomically.
      // Querying it again gives retries and a response interruption the exact same order.
      const completed = await findOrderForCart({ query, cartId })
      const order = completed.order || (result?.id ? { id: result.id } : null)
      if (!order?.id) {
        const error: any = new Error("Cart completion did not return an order.")
        error.code = "ORDER_CART_LOOKUP_FAILED"
        error.status = 500
        throw error
      }
      await convertCartBundleSnapshotsToOrder({ scope: req.scope, query, cartId, orderId: order.id })
      return { type: "order", order, reused: false, lookup_source: completed.lookupSource }
    }, { timeout: 20 })

    return res.json(response)
  } catch (error: any) {
    const status = Number(error?.status) || 500
    const code = error?.code || (status === 409 ? "BUNDLE_CHECKOUT_CONFLICT" : "B2C_CART_COMPLETE_FAILED")
    console.error("[B2C_COMPLETE_ERROR]", { cart_id: cartId, code, message: error?.message })
    return res.status(status).json({ code, message: error?.message || "An unknown error occurred during cart completion.", details: error?.details })
  }
}
