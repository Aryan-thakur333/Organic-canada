import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

type Price = {
  id: string
  amount: number
  currency_code: string
  price_set_id?: string | null
}

type Variant = {
  id: string
  sku?: string | null
  prices?: Price[]
}

type QueryGraph = {
  graph(input: Record<string, unknown>): Promise<{
    data: unknown[]
  }>
}

type PriceSetLink = {
  price_set_id?: string | null
}

type PricingService = {
  createPriceSets(input: Array<Record<string, never>>): Promise<
    { id?: string } | Array<{ id?: string }>
  >
  createPrices(input: Array<{
    price_set_id: string
    currency_code: string
    amount: number
    rules: Record<string, never>
  }>): Promise<unknown>
  updatePrices(input: Array<{
    id: string
    amount: number
  }>): Promise<unknown>
}

type LinkService = {
  create(input: Record<string, unknown>): Promise<unknown>
}

type ErpService = {
  getExactProductForSync(sku: string): Promise<{
    id: number
    name: string
    default_code: string | false
    list_price: number
    active: boolean
  }>
}

const SUPPORTED_CURRENCIES = new Set(["usd", "cad"])

function errorResponse(
  res: MedusaResponse,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  dryRun = true
) {
  return res.status(status).json({
    success: false,
    dryRun,
    ...details,
    error: { code, message },
  })
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const sku =
    typeof req.query.sku === "string"
      ? req.query.sku.trim()
      : ""
  const priceSyncEnabled =
    process.env.ERP_PRICE_SYNC_ENABLED === "true"
  const priceDryRun =
    process.env.ERP_PRICE_DRY_RUN !== "false"
  const dryRun = priceDryRun
  const body = req.body as {
    confirmPriceWrite?: unknown
  } | undefined
  const source = process.env.ERP_PRICE_SOURCE?.trim()
  const configuredBaseCurrency =
    process.env.ERP_BASE_PRICE_CURRENCY?.trim() || ""
  const baseCurrency =
    configuredBaseCurrency.toLowerCase()

  if (!sku) {
    return errorResponse(
      res,
      400,
      "ERP_PRICE_EXACT_SKU_REQUIRED",
      "Price sync requires one exact SKU."
    )
  }

  if (!priceSyncEnabled && !priceDryRun) {
    return errorResponse(
      res,
      409,
      "ERP_PRICE_SYNC_DISABLED",
      "Set ERP_PRICE_SYNC_ENABLED=true before disabling price dry-run mode.",
      { sku },
      false
    )
  }

  if (source !== "odoo") {
    return errorResponse(
      res,
      409,
      "ERP_PRICE_SOURCE_MISSING",
      "ERP_PRICE_SOURCE must be explicitly set to odoo.",
      { sku }
    )
  }

  if (!configuredBaseCurrency) {
    return errorResponse(
      res,
      409,
      "ERP_PRICE_CURRENCY_UNRESOLVED",
      "ERP_BASE_PRICE_CURRENCY must explicitly be USD or CAD before a price can be proposed.",
      { sku, configuredBaseCurrency: null }
    )
  }

  if (!SUPPORTED_CURRENCIES.has(baseCurrency)) {
    return errorResponse(
      res,
      409,
      "ERP_PRICE_CURRENCY_UNSUPPORTED",
      "ERP_BASE_PRICE_CURRENCY supports only USD or CAD.",
      { sku, configuredBaseCurrency }
    )
  }

  try {
    console.info(
      `[ERP_PRICE_DRY_RUN_START] provider=odoo sku=${sku} currency=${baseCurrency}`
    )
    const erp = req.scope.resolve<ErpService>("erp")
    const query = req.scope.resolve<QueryGraph>(
      ContainerRegistrationKeys.QUERY
    )
    const [odooProduct, variantsResult] = await Promise.all([
      erp.getExactProductForSync(sku),
      query.graph({
        entity: "variant",
        fields: [
          "id",
          "sku",
          "prices.id",
          "prices.amount",
          "prices.currency_code",
          "prices.price_set_id",
        ],
        filters: { sku: [sku] },
      }),
    ])

    const variants = variantsResult.data as Variant[]
    if (!variants.length) {
      return errorResponse(
        res,
        404,
        "ERP_PRICE_SKU_NOT_FOUND",
        "No Medusa variant matches the exact ERP SKU.",
        { sku }
      )
    }

    if (variants.length > 1) {
      return errorResponse(
        res,
        409,
        "ERP_PRICE_DUPLICATE_SKU",
        "Multiple Medusa variants match the exact ERP SKU.",
        { sku }
      )
    }

    const sourceAmount = Number(odooProduct.list_price)
    if (!Number.isFinite(sourceAmount) || sourceAmount < 0) {
      return errorResponse(
        res,
        409,
        "ERP_PRICE_INVALID_AMOUNT",
        "Odoo list_price must be a finite non-negative selling price.",
        { sku, odooProductId: odooProduct.id }
      )
    }

    const variant = variants[0]
    const prices = variant.prices || []
    const linkedPriceSetResult = await query.graph({
      entity: "product_variant_price_set",
      fields: ["variant_id", "price_set_id"],
      filters: { variant_id: [variant.id] },
    })
    const priceSetIds = Array.from(
      new Set(
        [
          ...prices.map((price) => price.price_set_id),
          ...(linkedPriceSetResult.data as PriceSetLink[])
            .map((link) => link.price_set_id),
        ]
          .map((id) => id?.trim())
          .filter((id): id is string => Boolean(id))
      )
    )
    const currentPrices = Object.fromEntries(
      prices
        .filter((price) =>
          SUPPORTED_CURRENCIES.has(
            price.currency_code.toLowerCase()
          )
        )
        .map((price) => [
          price.currency_code.toLowerCase(),
          { id: price.id, amount: Number(price.amount) },
        ])
    )

    if (priceSetIds.length > 1) {
      return errorResponse(
        res,
        409,
        "ERP_PRICE_SET_AMBIGUOUS",
        "The Medusa variant has multiple price sets and cannot be priced safely.",
        {
          sku,
          odoo: {
            productId: odooProduct.id,
            listPrice: sourceAmount,
            currency: baseCurrency,
          },
          medusa: {
            variantId: variant.id,
            currentPrices,
            priceSetIds,
          },
        }
      )
    }

    const matchingPrices = prices.filter(
      (price) =>
        price.currency_code.toLowerCase() === baseCurrency
    )
    if (matchingPrices.length > 1) {
      return errorResponse(
        res,
        409,
        "ERP_PRICE_DUPLICATE_CURRENCY",
        "The configured currency has multiple Medusa price records.",
        { sku, currency: baseCurrency.toUpperCase() },
        dryRun
      )
    }

    const existingPrice = matchingPrices[0]
    const action = existingPrice ? "UPDATE" : "CREATE"

    if (dryRun) {
      console.info(
        `[ERP_PRICE_DRY_RUN_COMPLETE] provider=odoo sku=${sku} currency=${baseCurrency} action=${action}`
      )
      return res.status(200).json({
        success: true,
        dryRun: true,
        sku,
        odoo: {
          productId: odooProduct.id,
          price: sourceAmount,
          currency: baseCurrency.toUpperCase(),
        },
        medusa: {
          variantId: variant.id,
          priceSetId: priceSetIds[0] || null,
          currentUsdPrice: currentPrices.usd?.amount ?? null,
          currentCadPrice: currentPrices.cad?.amount ?? null,
        },
        plan: [{
          action,
          currency: baseCurrency.toUpperCase(),
          currentAmount: existingPrice?.amount ?? null,
          proposedAmount: sourceAmount,
        }],
        writeGuards: {
          priceSyncEnabled,
          priceDryRun,
          amountUnit: "major",
          writesImplemented: false,
        },
      })
    }

    if (body?.confirmPriceWrite !== true) {
      return errorResponse(
        res,
        400,
        "ERP_PRICE_WRITE_CONFIRMATION_REQUIRED",
        "Set confirmPriceWrite to true for the exact SKU price write.",
        { sku },
        false
      )
    }

    const pricing = req.scope.resolve<PricingService>("pricing")
    const remoteLink = req.scope.resolve<LinkService>(
      ContainerRegistrationKeys.LINK
    )
    const currency = baseCurrency.toUpperCase()

    if (existingPrice && Number(existingPrice.amount) === sourceAmount) {
      console.info(
        `[ERP_PRICE_UNCHANGED] provider=odoo sku=${sku} currency=${currency} priceSetId=${priceSetIds[0] || "unknown"}`
      )
      return res.status(200).json({
        success: true,
        dryRun: false,
        sku,
        currency,
        action: "UNCHANGED",
        previousAmount: Number(existingPrice.amount),
        newAmount: Number(existingPrice.amount),
        priceSetId: priceSetIds[0] || null,
      })
    }

    console.info(
      `[ERP_PRICE_WRITE_START] provider=odoo sku=${sku} currency=${currency} action=${action}`
    )
    let priceSetId: string | undefined = priceSetIds[0]
    try {
      if (!priceSetId) {
        const created = await pricing.createPriceSets([{}])
        priceSetId = Array.isArray(created)
          ? created[0]?.id
          : created.id
        if (!priceSetId) {
          throw new Error("Price set creation did not return an ID")
        }
        await remoteLink.create({
          [Modules.PRODUCT]: { variant_id: variant.id },
          [Modules.PRICING]: { price_set_id: priceSetId },
        })
      }
      const resolvedPriceSetId = priceSetId
      if (!resolvedPriceSetId) {
        throw new Error("Price set ID is unavailable for price creation")
      }

      if (existingPrice) {
        await pricing.updatePrices([{
          id: existingPrice.id,
          amount: sourceAmount,
        }])
        console.info(
          `[ERP_PRICE_UPDATE_SUCCESS] provider=odoo sku=${sku} currency=${currency} priceSetId=${priceSetId}`
        )
      } else {
        await pricing.createPrices([{
          price_set_id: resolvedPriceSetId,
          currency_code: baseCurrency,
          amount: sourceAmount,
          rules: {},
        }])
        console.info(
          `[ERP_PRICE_CREATE_SUCCESS] provider=odoo sku=${sku} currency=${currency} priceSetId=${priceSetId}`
        )
      }

      return res.status(200).json({
        success: true,
        dryRun: false,
        sku,
        currency,
        action,
        previousAmount:
          existingPrice?.amount ?? null,
        newAmount: sourceAmount,
        priceSetId,
      })
    } catch (error) {
      console.error(
        `[ERP_PRICE_WRITE_FAILED] provider=odoo sku=${sku} currency=${currency}`
      )
      return errorResponse(
        res,
        502,
        "ERP_PRICE_WRITE_FAILED",
        "Could not apply the Medusa price update.",
        { sku, currency },
        false
      )
    }
  } catch (error) {
    const code =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "ERP_PRICE_SOURCE_MISSING"

    console.warn(
      `[ERP_PRICE_DRY_RUN_FAILED] provider=odoo sku=${sku} code=${code}`
    )
    return errorResponse(
      res,
      502,
      code,
      error instanceof Error
        ? error.message
        : "Unable to prepare the ERP price proposal.",
      {},
      dryRun
    )
  }
}
