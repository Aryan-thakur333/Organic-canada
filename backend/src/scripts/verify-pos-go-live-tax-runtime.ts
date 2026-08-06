import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { nativeAmountToMinor } from "../utils/pos/money"

type Country = "ca" | "us"

const number = (value: unknown) => Number(value ?? 0)

export default async function verifyPosGoLiveTaxRuntime({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pos = container.resolve(POS_MODULE) as PosModuleService

  async function verify(country: Country, transactionId: string | undefined) {
    const expectedCurrency = country === "ca" ? "cad" : "usd"
    const base = {
      registerId: "",
      regionId: "",
      currency: expectedCurrency,
      ...(country === "us" ? { jurisdiction: "" } : {}),
      subtotalMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      orderTotalMinor: 0,
      receiptTotalMinor: 0,
      passed: false,
    }
    if (!transactionId) return { ...base, reason: `POS_GO_LIVE_${country.toUpperCase()}_TRANSACTION_ID is not configured` }
    try {
      const transaction = await pos.retrievePosTransaction(transactionId) as Record<string, unknown>
      const register = await pos.retrievePosRegister(String(transaction.register_id)) as Record<string, unknown>
      const [orderResult, locationResult, receipts, payments, returns] = await Promise.all([
        query.graph({
          entity: "order",
          fields: [
            "id", "region_id", "currency_code", "subtotal", "discount_total", "tax_total", "total",
            "shipping_address.country_code", "shipping_address.province", "shipping_address.postal_code",
            "items.tax_total", "items.tax_lines.id", "items.tax_lines.code", "items.tax_lines.rate", "items.tax_lines.provider_id",
            "shipping_methods.tax_total", "shipping_methods.tax_lines.id", "shipping_methods.tax_lines.code", "shipping_methods.tax_lines.rate",
          ],
          filters: { id: String(transaction.order_id || "") },
        }),
        query.graph({ entity: "stock_location", fields: ["id", "address.country_code", "address.province", "address.postal_code"], filters: { id: String(register.stock_location_id) } }),
        pos.listPosReceipts({ transaction_id: transaction.id }),
        pos.listPosPayments({ transaction_id: transaction.id }),
        pos.listPosReturns({ original_order_id: String(transaction.order_id || "") }),
      ])
      const order = orderResult.data[0] as Record<string, unknown> | undefined
      const location = locationResult.data[0] as { address?: { country_code?: string; province?: string; postal_code?: string } } | undefined
      if (!order) return { ...base, registerId: String(register.id), regionId: String(register.region_id), reason: "Native order not found" }
      const receipt = (receipts as Array<Record<string, unknown>>).find((candidate) => number((candidate.receipt_payload as Record<string, unknown> | undefined)?.total_minor) > 0)
      const receiptPayload = (receipt?.receipt_payload as Record<string, unknown>) || {}
      const itemTaxLines = ((order.items as Array<Record<string, unknown>> | undefined) || []).flatMap((item) => (item.tax_lines as unknown[] | undefined) || [])
      const shippingTaxLines = ((order.shipping_methods as Array<Record<string, unknown>> | undefined) || []).flatMap((method) => (method.tax_lines as unknown[] | undefined) || [])
      const returnItems = (returns as Array<Record<string, unknown>>).flatMap((entry) => (entry.items as Array<Record<string, unknown>> | undefined) || [])
      const orderTotalMinor = nativeAmountToMinor(order.total, expectedCurrency, "go-live order total")
      const taxMinor = number(transaction.tax_total_minor)
      const totalMinor = number(transaction.total_minor)
      const paymentTotalMinor = (payments as Array<Record<string, unknown>>).reduce((sum, payment) => sum + number(payment.amount_minor), 0)
      const address = (order.shipping_address as Record<string, unknown> | undefined) || location?.address || {}
      const addressCountry = String(address.country_code || "").toLowerCase()
      const jurisdiction = [address.province, address.postal_code].filter(Boolean).join(" ")
      const exactTotals = orderTotalMinor === totalMinor && number(receiptPayload.total_minor) === totalMinor && paymentTotalMinor === totalMinor && number(receiptPayload.tax_total_minor) === taxMinor
      const taxPresent = taxMinor > 0 && itemTaxLines.length > 0
      const shippingTaxCorrect = shippingTaxLines.length > 0 || ((order.shipping_methods as unknown[] | undefined) || []).length === 0
      const promotionApplied = number(transaction.discount_total_minor) > 0
      const returnTaxReversed = returnItems.length > 0 && returnItems.some((item) => number(item.tax_minor) > 0) && returnItems.every((item) => number(item.refund_total_minor) === number(item.subtotal_minor) - number(item.discount_minor) + number(item.tax_minor))
      const countryCorrect = addressCountry === country && String(location?.address?.country_code || "").toLowerCase() === country
      const passed = String(transaction.status) === "COMPLETED" && String(transaction.currency_code).toLowerCase() === expectedCurrency && String(register.currency_code).toLowerCase() === expectedCurrency && String(transaction.region_id) === String(register.region_id) && countryCorrect && taxPresent && shippingTaxCorrect && exactTotals
      return {
        registerId: String(register.id),
        regionId: String(register.region_id),
        currency: expectedCurrency,
        ...(country === "us" ? { jurisdiction } : {}),
        subtotalMinor: number(transaction.subtotal_minor),
        discountMinor: number(transaction.discount_total_minor),
        taxMinor,
        totalMinor,
        orderTotalMinor,
        receiptTotalMinor: number(receiptPayload.total_minor),
        paymentTotalMinor,
        itemTaxLineCount: itemTaxLines.length,
        shippingTaxLineCount: shippingTaxLines.length,
        promotionApplied,
        returnTaxReversed,
        passed,
        reason: passed ? undefined : "Register/region/address, native tax lines, or exact totals did not pass",
      }
    } catch (error) {
      return { ...base, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  const canada = await verify("ca", process.env.POS_GO_LIVE_CA_TRANSACTION_ID)
  const usa = await verify("us", process.env.POS_GO_LIVE_US_TRANSACTION_ID)
  console.log("[CANADA_POS_TAX_RUNTIME]")
  console.log(JSON.stringify(canada, null, 2))
  console.log("[USA_POS_TAX_RUNTIME]")
  console.log(JSON.stringify(usa, null, 2))
}
