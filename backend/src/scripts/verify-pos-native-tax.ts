import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createCartWorkflow, refreshCartItemsWorkflow } from "@medusajs/core-flows"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { nativeAmountToMinor } from "../utils/pos/money"

type VariantCandidate = {
  id: string
  product?: { sales_channels?: Array<{ id: string }> }
  prices?: Array<{ currency_code: string; amount: number }>
}

export default async function verifyPosNativeTax({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pos = container.resolve(POS_MODULE) as PosModuleService
  const registers = await pos.listPosRegisters({}, { take: 100 })
  const variantsResult = await query.graph({ entity: "variant", fields: ["id", "product.sales_channels.id", "prices.currency_code", "prices.amount"], pagination: { take: 10000 } })
  const variants = variantsResult.data as VariantCandidate[]
  const results: unknown[] = []
  for (const register of registers) {
    const variant = variants.find((candidate) => candidate.product?.sales_channels?.some((channel) => channel.id === register.sales_channel_id) && candidate.prices?.some((price) => price.currency_code === register.currency_code && Number(price.amount) > 0))
    if (!variant) {
      results.push({ registerId: register.id, regionId: register.region_id, currencyCode: register.currency_code, result: "FAILED", reason: "No region-priced POS variant" })
      continue
    }
    const locationResult = await query.graph({ entity: "stock_location", fields: ["address.*"], filters: { id: register.stock_location_id } })
    const locationAddress = (locationResult.data[0]?.address || {}) as Record<string, unknown>
    const { id: _addressId, created_at: _createdAt, updated_at: _updatedAt, deleted_at: _deletedAt, ...address } = locationAddress
    const { result: created } = await createCartWorkflow(container).run({
      input: {
        region_id: register.region_id, currency_code: register.currency_code, sales_channel_id: register.sales_channel_id,
        email: `tax-verification-${register.id}@pos.eatsie.local`, shipping_address: address, billing_address: address,
        items: [{ variant_id: variant.id, quantity: 1, requires_shipping: false }],
        metadata: { source: "pos-production-readiness-tax-verification", register_id: register.id },
      },
    })
    await refreshCartItemsWorkflow(container).run({ input: { cart_id: created.id, force_refresh: true, force_tax_calculation: true } })
    const cartResult = await query.graph({ entity: "cart", fields: ["id", "subtotal", "discount_total", "tax_total", "total", "items.id", "items.variant_id", "items.quantity", "items.unit_price", "items.subtotal", "items.total", "items.tax_lines.id", "items.tax_lines.provider_id", "items.tax_lines.code", "items.tax_lines.rate"], filters: { id: created.id } })
    const cart = cartResult.data[0] as unknown as Record<string, unknown>
    const cartItems = (cart.items as Array<Record<string, unknown>> | undefined) || []
    const hasNativeTaxLines = cartItems.some((item) => ((item.tax_lines as unknown[] | undefined) || []).length > 0)
    results.push({
      registerId: register.id, regionId: register.region_id, currencyCode: register.currency_code,
      subtotalMinor: nativeAmountToMinor(cart.subtotal, register.currency_code, "verification subtotal"), discountMinor: nativeAmountToMinor(cart.discount_total, register.currency_code, "verification discount"), taxMinor: nativeAmountToMinor(cart.tax_total, register.currency_code, "verification tax"),
      totalMinor: nativeAmountToMinor(cart.total, register.currency_code, "verification total"), nativeOrderTotalMinor: 0, receiptTotalMinor: 0,
      cartId: cart.id, nativeTaxLines: cartItems.flatMap((item) => (item.tax_lines as unknown[] | undefined) || []),
      nativeItems: cartItems,
      result: hasNativeTaxLines ? "PASSED" : "FAILED",
      reason: hasNativeTaxLines ? undefined : "Medusa returned no native tax lines because the configured system tax region has no rates",
    })
  }
  console.log("[POS_TAX_VERIFICATION]")
  console.log(JSON.stringify(results, null, 2))
}
