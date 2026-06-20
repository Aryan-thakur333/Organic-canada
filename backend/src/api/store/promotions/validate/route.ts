import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

const DEFAULT_PROMOTIONS = [
  { code: "WELCOME10", min_cart_value: 0, is_one_time: true },
  { code: "ORGANIC20", min_cart_value: 300, is_one_time: false },
  { code: "FREESHIP", min_cart_value: 100, is_one_time: false },
  { code: "SAVE50", min_cart_value: 500, is_one_time: true },
]

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { code, cart_id } = req.body as any

  if (!code) {
    return res.status(400).json({ valid: false, message: "Coupon code is required" })
  }
  if (!cart_id) {
    return res.status(400).json({ valid: false, message: "Cart ID is required" })
  }

  try {
    const promotionService: any = req.scope.resolve(Modules.PROMOTION)
    const cartService: any = req.scope.resolve(Modules.CART)
    const query: any = req.scope.resolve("query")

    // 1. Fetch promotion
    const [promo] = await promotionService.listPromotions(
      { code: code.toUpperCase() },
      { relations: ["application_method"] }
    )

    if (!promo) {
      return res.status(404).json({ valid: false, message: "Coupon code not found" })
    }

    if (promo.status !== "active") {
      return res.status(400).json({ valid: false, message: "Coupon is not active" })
    }

    // 2. Fetch cart subtotal
    const cart = await cartService.retrieveCart(cart_id)
    if (!cart) {
      return res.status(404).json({ valid: false, message: "Cart not found" })
    }

    const subtotal = (cart.subtotal || 0) / 100

    // 3. Expiration Check
    if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
      return res.status(400).json({ valid: false, message: "Coupon has expired" })
    }

    // 4. Minimum Cart Value Check
    const meta = DEFAULT_PROMOTIONS.find(d => d.code === promo.code)
    const minVal = meta ? meta.min_cart_value : 0
    if (subtotal < minVal) {
      return res.status(400).json({ 
        valid: false, 
        message: `Minimum cart value of ₹${minVal} is required. Your current cart is ₹${subtotal}.` 
      })
    }

    // 5. Usage Limit Check
    if (promo.limit !== null && (promo.used || 0) >= promo.limit) {
      return res.status(400).json({ valid: false, message: "Coupon usage limit reached" })
    }

    // 6. One-Time Use Support
    const customer_id = (req as any).auth_context?.actor_id
    const isOneTime = meta ? meta.is_one_time : false

    if (isOneTime && customer_id) {
      // Find customer's orders using Query Graph to see if they already used this promo
      const { data: customerOrders } = await query.graph({
        entity: "order",
        fields: ["id", "summary", "metadata", "promotions.*"],
        filters: { customer_id },
      })

      const alreadyUsed = customerOrders.some((order: any) => {
        // Check order metadata or promotion code or promotions relation
        if (order.metadata?.coupon_code === promo.code) return true
        if (order.summary?.promotion_codes?.includes(promo.code)) return true
        if (order.promotions?.some((p: any) => p.code === promo.code)) return true
        return false
      })

      if (alreadyUsed) {
        return res.status(400).json({ 
          valid: false, 
          message: "You have already used this coupon code. It is limited to one use per customer." 
        })
      }
    }

    return res.json({ 
      valid: true, 
      coupon: {
        id: promo.id,
        code: promo.code,
        type: promo.application_method?.type || "percentage",
        value: promo.application_method?.value || 0,
        min_cart_value: minVal,
      } 
    })
  } catch (error: any) {
    console.error("[Promotions Validate] Error:", error)
    return res.status(500).json({ valid: false, message: error.message || "Failed to validate coupon" })
  }
}
