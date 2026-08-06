import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { COMMISSION_MODULE } from "../../../../../modules/commission"
import { calculateCommission } from "../../../../../utils/commission/calculate"
import { getCustomerCommissionType } from "../../../../../utils/commission/customer-type"

/**
 * POST /store/carts/:id/calculate-commission
 * 
 * Calculates the exact customer platform fee based on the customer type
 * and applies it to the cart as a custom line item so it natively increases
 * the cart.total (and thus the Stripe payment intent amount).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id: cartId } = req.params

  if (!cartId) {
    return res.status(400).json({ message: "Cart ID is required" })
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const commissionService: any = req.scope.resolve(COMMISSION_MODULE)
    const cartModule: any = req.scope.resolve(Modules.CART)

    // 1. Fetch Cart details
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "customer_id",
        "email",
        "currency_code",
        "region_id",
        "sales_channel_id",
        "subtotal",
        "total",
        "tax_total",
        "shipping_total",
        "discount_total",
        "metadata",
        "items.*",
        "items.variant_id",
        "items.metadata",
        "payment_collection.*",
        "payment_collection.payment_sessions.*",
        "payment_collection.payments.*"
      ],
      filters: { id: cartId },
    })

    const cart = carts?.[0]
    if (!cart) {
      return res.status(404).json({ message: `Cart not found` })
    }

    console.log("[COMMISSION_CART_RESULT]", {
      cart_id: cart?.id,
      has_payment_collection: !!cart?.payment_collection,
      payment_collection_id: cart?.payment_collection?.id || null,
      payment_sessions: cart?.payment_collection?.payment_sessions?.length || 0,
    })

    // 2. Identify Customer Type based on Cart Type metadata
    let customerType: "normal_customer" | "b2b_customer" = "normal_customer"
    
    if (cart.metadata?.cart_type === "b2b" || cart.metadata?.cart_type === "b2b_quote") {
      customerType = "b2b_customer"
    } else {
      if (cart.customer_id) {
        try {
          const { data: customers } = await query.graph({
            entity: "customer",
            fields: ["id", "metadata"],
            filters: { id: cart.customer_id },
          })
          customerType = getCustomerCommissionType(customers?.[0])
        } catch {
          // Fallback to normal
        }
      }
    }

    // 3. Load Active Setting
    let activeRule: any = null
    try {
      const settings = await commissionService.listCommissionSettings({
        account_type: customerType,
        is_active: true
      }, { take: 1 })
      activeRule = settings?.[0] || null
    } catch {
      // Ignore
    }

    // 4. Calculate Customer Payable Base
    // Remove any existing Platform Fee line item processing since it's now in metadata
    let baseAmount = Number(cart.total || 0)

    // 5. Calculate Platform Fee
    let platformFeeAmount = 0
    let feeBreakdown = {
      base_amount: baseAmount,
      fee_type: "none",
      fee_value: 0,
      fee_amount: 0,
      customer_type: customerType
    }

    if (activeRule && baseAmount > 0) {
      const calcResult = calculateCommission(activeRule, baseAmount)
      platformFeeAmount = calcResult.commission_amount
      
      feeBreakdown = {
        base_amount: baseAmount,
        fee_type: activeRule.fee_type,
        fee_value: activeRule.fee_value,
        fee_amount: platformFeeAmount,
        customer_type: customerType
      }
    }

    const fingerprint = `${cart.updated_at}_${baseAmount}_${activeRule?.id}`

    // Idempotency Check
    if (cart.metadata?.platform_fee_fingerprint === fingerprint) {
      return res.json({ 
        success: true,
        cart_id: cartId,
        new_total: cart.total, // Cart total does not artificially inflate in this implementation
        breakdown: feeBreakdown,
        message: "Commission calculation up to date."
      })
    }

    // 6. Store commission as metadata
    await cartModule.updateCarts([{
      id: cartId,
      metadata: {
        ...cart.metadata,
        platform_fee_total: platformFeeAmount,
        platform_fee_type: activeRule?.fee_type || 'none',
        platform_fee_value: activeRule?.fee_value || 0,
        platform_fee_account_type: customerType,
        platform_fee_calculated_at: new Date().toISOString(),
        platform_fee_fingerprint: fingerprint
      }
    }])

    // Cleanup: If there was a legacy "Platform Fee" line item, remove it.
    const existingFeeItem = cart.items?.find((i: any) => i.title === "Platform Fee" || i.metadata?.is_platform_fee)
    if (existingFeeItem) {
      await cartModule.deleteLineItems(cartId, [existingFeeItem.id])
    }

    // Fetch the updated cart to return to the frontend
    const { data: updatedCarts } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "total",
        "payment_collection.id"
      ],
      filters: { id: cartId },
    })
    
    const updatedCart = updatedCarts?.[0]

    return res.json({ 
      success: true,
      cart_id: cartId,
      new_total: updatedCart?.total,
      breakdown: feeBreakdown,
      message: "Commission calculated and cart updated."
    })
  } catch (error: any) {
    console.error("[Cart Commission] Error calculating commission:", error.message)
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to calculate commission",
    })
  }
}
