import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../modules/b2b"

const B2B_PRICE_LIST_TITLE = "B2B customer"

function asArray(value: any): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value.toArray === "function") return value.toArray()
  return [value]
}

async function findB2BPriceList(pricingModule: any) {
  const lists = await pricingModule.listPriceLists?.(
    { title: B2B_PRICE_LIST_TITLE, status: ["active"] },
    { take: 10, relations: ["prices", "price_list_rules"] }
  ) ?? (await pricingModule.listAndCountPriceLists(
    { title: B2B_PRICE_LIST_TITLE, status: ["active"] },
    { take: 10, relations: ["prices", "price_list_rules"] }
  ))[0]

  return (lists || []).find((list: any) =>
    list.title === B2B_PRICE_LIST_TITLE &&
    list.status === "active" &&
    asArray(list.prices || list.money_amounts).length > 0
  ) || null
}

async function approvedCompanies(b2bService: any) {
  const filters = { status: ["approved", "active"] }
  try {
    return await b2bService.listCompanies(filters, { take: 500 })
  } catch {
    const [companies] = await b2bService.listAndCountCompanies(filters, { take: 500 })
    return companies || []
  }
}

export default async function debugB2BPriceListProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve("query")
  const pricingModule: any = container.resolve(Modules.PRICING)
  const b2bService: any = container.resolve(B2B_MODULE)

  const priceList = await findB2BPriceList(pricingModule)
  if (!priceList) {
    logger.warn("[debug-b2b-price-list-products] No active B2B price list found.")
    return { price_list: null, products_count: 0 }
  }

  const prices = asArray(priceList.prices || priceList.money_amounts)
  const priceSetIds = Array.from(new Set(prices.map((price) => price.price_set_id).filter(Boolean)))
  const { data: links } = await query.graph({
    entity: "product_variant_price_set",
    fields: ["variant_id", "price_set_id"],
    filters: { price_set_id: priceSetIds },
  })

  const variantIds = Array.from(new Set((links || []).map((link: any) => link.variant_id).filter(Boolean)))
  const priceSetByVariantId = new Map((links || []).map((link: any) => [link.variant_id, link.price_set_id]))
  const { data: variants } = variantIds.length
    ? await query.graph({
        entity: "variant",
        fields: [
          "id",
          "title",
          "prices.*",
          "product.id",
          "product.title",
          "product.status",
        ],
        filters: { id: variantIds },
      })
    : { data: [] }

  const calculatedPrices = priceSetIds.length
    ? await pricingModule.calculatePrices(
        { id: priceSetIds },
        { context: { currency_code: "cad" } }
      )
    : []
  const calculatedByPriceSetId = new Map(calculatedPrices.map((price: any) => [price.id, price]))
  const connectedRules = asArray(priceList.price_list_rules).filter((rule) =>
    rule?.attribute === "customer_group_id" || rule?.attribute === "customer.groups.id"
  )
  const companies = await approvedCompanies(b2bService)

  const productIds = new Set((variants || []).map((variant: any) => variant.product?.id).filter(Boolean))
  const sampleProducts = (variants || []).slice(0, 10).map((variant: any) => {
    const priceSetId = priceSetByVariantId.get(variant.id)
    const calculated = priceSetId ? calculatedByPriceSetId.get(priceSetId) : null
    return {
      product_id: variant.product?.id,
      title: variant.product?.title,
      status: variant.product?.status,
      variant_id: variant.id,
      original_price: (calculated as any)?.original_amount ?? variant.prices?.[0]?.amount ?? null,
      b2b_price: (calculated as any)?.calculated_amount ?? null,
    }
  })

  const summary = {
    price_list: {
      id: priceList.id,
      title: priceList.title,
      status: priceList.status,
    },
    price_overrides_count: prices.length,
    price_set_count: priceSetIds.length,
    sample_override_variant_ids: variantIds.slice(0, 10),
    resolved_products_count: productIds.size,
    sample_products: sampleProducts,
    b2b_customer_group_connected: connectedRules.length > 0,
    price_list_group_rules: connectedRules.map((rule: any) => ({
      attribute: rule.attribute,
      value: rule.value,
    })),
    approved_b2b_customers_count: companies.filter((company: any) => company.customer_id).length,
  }

  logger.info("[debug-b2b-price-list-products]")
  logger.info(JSON.stringify(summary, null, 2))
  return summary
}
