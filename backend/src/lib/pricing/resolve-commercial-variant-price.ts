import { Modules, QueryContext } from "@medusajs/framework/utils"

const B2B_PRICE_LIST_TITLE = "B2B customer"

export type CommercialVariantPriceSource =
  | "b2b_price_list_override"
  | "medusa_calculated_price"
  | "pricing_module_calculated_price"
  | "variant_embedded_price"
  | "unavailable"

export type ResolveCommercialVariantPriceInput = {
  container: any
  variantId: string
  regionId?: string | null
  currencyCode: string
  countryCode?: string | null
  salesChannelId?: string | null
  customerId?: string | null
  customerGroupId?: string | null
  quantity?: number | null
}

export type ResolvedCommercialVariantPrice = {
  amountMinor: number
  currencyCode: string
  variantId: string
  sku: string | null
  productId: string | null
  productTitle: string | null
  variantTitle: string | null
  priceSetId: string | null
  calculatedPriceType: string | null
  source: CommercialVariantPriceSource
  context: {
    regionId: string | null
    countryCode: string | null
    currencyCode: string
    salesChannelId: string | null
    customerId: string | null
    customerGroupId: string | null
  }
}

function asArray(value: any): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === "object" && typeof value.toArray === "function") return value.toArray()
  return [value]
}

function normalizeCurrencyCode(value?: string | null): string {
  return String(value || "cad").toLowerCase()
}

function normalizeCountryCode(value?: string | null): string | null {
  const country = String(value || "").trim().toLowerCase()
  return country || null
}

function positiveMinor(value: unknown): number {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
}

function buildPricingContext(input: ResolveCommercialVariantPriceInput) {
  const context: Record<string, any> = {
    currency_code: normalizeCurrencyCode(input.currencyCode),
  }

  if (input.regionId) context.region_id = input.regionId
  if (input.countryCode) context.country_code = normalizeCountryCode(input.countryCode)
  if (input.salesChannelId) context.sales_channel_id = input.salesChannelId
  if (input.customerId) context.customer_id = input.customerId
  if (input.customerGroupId) context.customer_group_id = input.customerGroupId

  return context
}

async function resolveVariantPriceSetId(query: any, variantId: string, variant: any) {
  const { data: links } = await query.graph({
    entity: "product_variant_price_set",
    fields: ["variant_id", "price_set_id"],
    filters: { variant_id: variantId },
    pagination: { take: 1 },
  })

  const linkedPriceSetId = links?.[0]?.price_set_id
  if (linkedPriceSetId) return linkedPriceSetId

  const embeddedPrice = asArray(variant?.prices).find((price: any) => price?.price_set_id)
  return embeddedPrice?.price_set_id || null
}

function isQuantityEligible(price: any, quantity?: number | null): boolean {
  const qty = Number(quantity || 1)
  const min = Number(price?.min_quantity)
  const max = Number(price?.max_quantity)

  if (Number.isFinite(min) && min > 0 && qty < min) return false
  if (Number.isFinite(max) && max > 0 && qty > max) return false
  return true
}

async function resolveB2BPriceListAmount({
  query,
  priceSetId,
  currencyCode,
  quantity,
}: {
  query: any
  priceSetId?: string | null
  currencyCode: string
  quantity?: number | null
}) {
  if (!priceSetId) return null

  const { data: priceLists } = await query.graph({
    entity: "price_list",
    fields: [
      "id",
      "title",
      "type",
      "status",
      "prices.id",
      "prices.price_set_id",
      "prices.amount",
      "prices.currency_code",
      "prices.min_quantity",
      "prices.max_quantity",
    ],
    filters: { title: B2B_PRICE_LIST_TITLE, status: "active" },
    pagination: { take: 10 },
  })

  const candidates = asArray(priceLists)
    .flatMap((priceList: any) =>
      asArray(priceList?.prices).map((price: any) => ({
        priceList,
        price,
      }))
    )
    .filter(({ price }) => {
      if (price?.price_set_id !== priceSetId) return false
      if (normalizeCurrencyCode(price?.currency_code) !== currencyCode) return false
      if (!isQuantityEligible(price, quantity)) return false
      return positiveMinor(price?.amount) > 0
    })
    .sort((a, b) => Number(b.price?.min_quantity || 0) - Number(a.price?.min_quantity || 0))

  const match = candidates[0]
  if (!match) return null

  return {
    amountMinor: positiveMinor(match.price.amount),
    calculatedPriceType: match.priceList?.type || "override",
  }
}

function resolveCalculatedAmount(variant: any, currencyCode: string) {
  const calculated = variant?.calculated_price
  if (!calculated) return null

  const calculatedCurrency = normalizeCurrencyCode(calculated.currency_code || currencyCode)
  if (calculatedCurrency !== currencyCode) return null

  const amountMinor = positiveMinor(
    calculated.calculated_amount ??
      calculated.amount ??
      calculated.calculated_price?.amount
  )

  if (amountMinor <= 0) return null

  return {
    amountMinor,
    calculatedPriceType: calculated.price_type || calculated.type || null,
  }
}

async function calculatePricingModuleAmount({
  container,
  priceSetId,
  pricingContext,
}: {
  container: any
  priceSetId?: string | null
  pricingContext: Record<string, any>
}) {
  if (!priceSetId) return null

  try {
    const pricingModule: any = container.resolve(Modules.PRICING)
    const result = await pricingModule.calculatePrices({ id: [priceSetId] }, pricingContext)
    const calculated = asArray(result)[0]
    const calculatedCurrency = normalizeCurrencyCode(calculated?.currency_code || pricingContext.currency_code)
    if (calculatedCurrency !== pricingContext.currency_code) return null

    const amountMinor = positiveMinor(
      calculated?.calculated_amount ??
        calculated?.amount ??
        calculated?.original_amount
    )

    if (amountMinor <= 0) return null

    return {
      amountMinor,
      calculatedPriceType: calculated?.price_type || calculated?.type || null,
    }
  } catch (error: any) {
    console.warn("[B2B_PRICE_CONTEXT] pricing module calculation failed", {
      priceSetId,
      currencyCode: pricingContext.currency_code,
      message: error?.message || error,
    })
    return null
  }
}

function resolveEmbeddedAmount(variant: any, currencyCode: string) {
  const exact = asArray(variant?.prices).find(
    (price: any) => normalizeCurrencyCode(price?.currency_code) === currencyCode
  )
  const amountMinor = positiveMinor(exact?.amount)
  if (amountMinor <= 0) return null
  return {
    amountMinor,
    priceSetId: exact?.price_set_id || null,
  }
}

function emptyResult(input: ResolveCommercialVariantPriceInput): ResolvedCommercialVariantPrice {
  const currencyCode = normalizeCurrencyCode(input.currencyCode)
  return {
    amountMinor: 0,
    currencyCode,
    variantId: input.variantId,
    sku: null,
    productId: null,
    productTitle: null,
    variantTitle: null,
    priceSetId: null,
    calculatedPriceType: null,
    source: "unavailable",
    context: {
      regionId: input.regionId || null,
      countryCode: normalizeCountryCode(input.countryCode),
      currencyCode,
      salesChannelId: input.salesChannelId || null,
      customerId: input.customerId || null,
      customerGroupId: input.customerGroupId || null,
    },
  }
}

export async function resolveCommercialVariantPrice(
  input: ResolveCommercialVariantPriceInput
): Promise<ResolvedCommercialVariantPrice> {
  const currencyCode = normalizeCurrencyCode(input.currencyCode)
  const pricingContext = buildPricingContext(input)
  const query = input.container.resolve("query")

  const { data: variants } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "sku",
      "title",
      "product.id",
      "product.title",
      "prices.id",
      "prices.amount",
      "prices.currency_code",
      "prices.price_set_id",
      "calculated_price.*",
    ],
    filters: { id: input.variantId },
    context: {
      calculated_price: QueryContext(pricingContext),
    },
    pagination: { take: 1 },
  })

  const variant = variants?.[0]
  if (!variant) return emptyResult(input)

  const priceSetId = await resolveVariantPriceSetId(query, input.variantId, variant)
  const base = {
    currencyCode,
    variantId: input.variantId,
    sku: variant.sku || null,
    productId: variant.product?.id || null,
    productTitle: variant.product?.title || null,
    variantTitle: variant.title || null,
    priceSetId,
    context: {
      regionId: input.regionId || null,
      countryCode: normalizeCountryCode(input.countryCode),
      currencyCode,
      salesChannelId: input.salesChannelId || null,
      customerId: input.customerId || null,
      customerGroupId: input.customerGroupId || null,
    },
  }

  const b2bOverride = await resolveB2BPriceListAmount({
    query,
    priceSetId,
    currencyCode,
    quantity: input.quantity,
  })
  if (b2bOverride) {
    return {
      ...base,
      amountMinor: b2bOverride.amountMinor,
      calculatedPriceType: b2bOverride.calculatedPriceType,
      source: "b2b_price_list_override",
    }
  }

  const medusaCalculated = resolveCalculatedAmount(variant, currencyCode)
  if (medusaCalculated) {
    return {
      ...base,
      amountMinor: medusaCalculated.amountMinor,
      calculatedPriceType: medusaCalculated.calculatedPriceType,
      source: "medusa_calculated_price",
    }
  }

  const moduleCalculated = await calculatePricingModuleAmount({
    container: input.container,
    priceSetId,
    pricingContext,
  })
  if (moduleCalculated) {
    return {
      ...base,
      amountMinor: moduleCalculated.amountMinor,
      calculatedPriceType: moduleCalculated.calculatedPriceType,
      source: "pricing_module_calculated_price",
    }
  }

  const embedded = resolveEmbeddedAmount(variant, currencyCode)
  if (embedded) {
    return {
      ...base,
      amountMinor: embedded.amountMinor,
      priceSetId: priceSetId || embedded.priceSetId,
      calculatedPriceType: null,
      source: "variant_embedded_price",
    }
  }

  return {
    ...base,
    amountMinor: 0,
    calculatedPriceType: null,
    source: "unavailable",
  }
}
