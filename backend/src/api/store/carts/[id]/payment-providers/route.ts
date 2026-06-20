import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Currency-to-provider routing rules.
 *
 * Each entry defines which payment provider IDs to serve for a given
 * currency code. The first matching rule wins. If no rule matches, all
 * registered providers are returned as a fallback.
 */
const CURRENCY_PROVIDER_MAP: Record<string, { allow: string[]; deny?: string[] }> = {
  eur: {
    allow: ["pp_stripe_stripe", "pp_system_default", "stripe"],
  },
  usd: {
    allow: ["pp_stripe_stripe", "pp_system_default", "stripe"],
  },
  inr: {
    deny: ["pp_stripe_stripe", "stripe"],
    allow: ["pp_paypay_paypay", "pp_system_default", "paypay", "manual"],
  },
  jpy: {
    deny: ["pp_stripe_stripe", "stripe"],
    allow: ["pp_paypay_paypay", "pp_system_default", "paypay", "manual"],
  },
  cny: {
    deny: ["pp_stripe_stripe", "stripe"],
    allow: ["pp_system_default", "manual"],
  },
}

/**
 * GET /store/carts/:id/payment-providers
 *
 * Returns available payment providers filtered by the cart's region currency.
 *
 * Flow:
 *   1. Extract cart_id from URL params
 *   2. Resolve Cart via query.graph to get its region_id & currency_code
 *   3. Resolve Region to confirm the currency_code
 *   4. Fetch all registered payment providers from the payment module
 *   5. Apply currency-based filtering:
 *      - EUR/USD → only Stripe providers
 *      - INR/JPY → local gateways (PayPay, system), stripe stripped
 *      - CNY → only system/manual, stripe stripped
 *      - Unmapped → all providers returned unfiltered
 *   6. Return { payment_providers: [...] } matching frontend checkout expectations
 *
 * Response shape (matches what frontend checkoutService expects):
 *   { payment_providers: Array<{ id: string; is_installed: boolean }> }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id: cartId } = req.params

  if (!cartId) {
    return res.status(400).json({ message: "Cart ID is required" })
  }

  try {
    // ── 1. Resolve services ─────────────────────────────────────────────
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const paymentModuleService: any = req.scope.resolve(Modules.PAYMENT)

    // ── 2. Fetch Cart with region info ──────────────────────────────────
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: ["id", "region_id", "currency_code"],
      filters: { id: cartId },
    })

    const cart = carts?.[0]
    if (!cart) {
      return res.status(404).json({ message: `Cart ${cartId} not found` })
    }

    if (!cart.region_id) {
      return res.status(400).json({
        message: "Cart has no assigned region. Please set a shipping address first.",
      })
    }

    // ── 3. Fetch Region for authoritative currency_code ─────────────────
    const currencyCode = cart.currency_code || ""
    let regionCurrency = currencyCode

    if (!regionCurrency) {
      // Fallback: resolve region's currency directly
      const { data: regions } = await query.graph({
        entity: "region",
        fields: ["id", "currency_code"],
        filters: { id: cart.region_id },
      })
      regionCurrency = regions?.[0]?.currency_code || ""
    }

    // ── 4. Fetch all registered payment providers ───────────────────────
    const allProviders: Array<{ id: string; is_installed?: boolean }> =
      await paymentModuleService.listPaymentProviders()

    if (!allProviders || allProviders.length === 0) {
      return res.json({ payment_providers: [] })
    }

    // ── 5. Apply currency-based filtering ───────────────────────────────
    const rules = CURRENCY_PROVIDER_MAP[regionCurrency.toLowerCase()]
    let filtered: Array<{ id: string; is_installed?: boolean }>

    if (rules) {
      if (rules.allow) {
        // Allow-list: only providers whose ID is in the allow array
        filtered = allProviders.filter((p) =>
          rules.allow!.some((allowed) =>
            p.id === allowed || p.id.endsWith(`_${allowed}`) || p.id.startsWith(`pp_${allowed}_`)
          )
        )
      } else {
        // Deny-list: remove providers that match the deny array
        filtered = allProviders.filter((p) =>
          !rules.deny!.some((denied) =>
            p.id === denied || p.id.endsWith(`_${denied}`) || p.id.startsWith(`pp_${denied}_`)
          )
        )
      }

      // If filtering emptied the list, fall through to unfiltered
      if (filtered.length === 0) {
        // Include at least the system provider so checkout doesn't crash
        const systemProvider = allProviders.find(
          (p) => p.id === "pp_system_default" || p.id === "manual" || p.id.includes("system")
        )
        filtered = systemProvider ? [systemProvider] : []
      }
    } else {
      // No currency-specific rules — return all providers unfiltered
      filtered = allProviders
    }

    // ── 6. Normalize output shape ───────────────────────────────────────
    const payment_providers: Array<{ id: string; is_installed: boolean }> = filtered.map((p) => ({
      id: p.id,
      is_installed: p.is_installed ?? true,
    }))

    console.log(
      `[Cart PaymentProviders] Cart ${cartId} (${regionCurrency}): ` +
      `returning ${payment_providers.length}/${allProviders.length} providers`
    )

    return res.json({ payment_providers })
  } catch (error: any) {
    console.error(`[Cart PaymentProviders] Error for cart ${cartId}:`, error.message)
    return res.status(500).json({
      message: error.message || "Failed to retrieve payment providers",
    })
  }
}
