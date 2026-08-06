import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../modules/b2b"
import { Modules, MedusaError } from "@medusajs/framework/utils"
import { createRequestForQuoteWorkflow } from "../../../../workflows/create-request-for-quote"
import { resolveCommercialVariantPrice } from "../../../../lib/pricing/resolve-commercial-variant-price"
import {
  getQuoteNegotiatedTotalMinor,
  getQuoteOriginalTotalMinor,
  quoteAdjustmentTotalMinor,
} from "../../../../utils/b2b/money"
import {
  getQuoteFinalPayableTotalMinor,
  quoteCommissionResponseFields,
} from "../../../../utils/b2b/quote-commission"

// ── Types ──────────────────────────────────────────────────────────────────

type QuoteItemInput = {
  source_type?: "variant" | "custom" | string | null
  product_id?: string | null
  variant_id?: string | null
  quantity: number
  title?: string
  sku?: string
  unit_price?: number
  price?: number
  unitPrice?: number
  displayed_unit_price?: number
  displayed_unit_price_minor?: number
  note?: string
}

type QuoteRequestBody = {
  cart_id?: string
  note?: string
  items?: QuoteItemInput[]
  buyer_note?: string
  currency_code?: string
  region_id?: string
  regionId?: string
  country_code?: string
  countryCode?: string
  sales_channel_id?: string
  salesChannelId?: string
  customer_group_id?: string
  customerGroupId?: string
}

const B2B_PRICE_LIST_TITLE = "B2B customer"
const PRICE_UNAVAILABLE_CODE = "B2B_QUOTE_PRICE_UNAVAILABLE"
const VARIANT_REQUIRED_CODE = "B2B_QUOTE_VARIANT_REQUIRED"
const MARKET_MISMATCH_CODE = "B2B_QUOTE_MARKET_MISMATCH"
const PRICE_CONTEXT_MISMATCH_CODE = "B2B_QUOTE_PRICE_CONTEXT_MISMATCH"

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeCurrencyCode(value?: string | null): string {
  return String(value || "cad").toLowerCase()
}

function normalizeCountryCode(value?: string | null): string | null {
  const country = String(value || "").trim().toLowerCase()
  return country || null
}

function normalizeVariantId(value?: string | null): string | null {
  const variantId = String(value || "").trim()
  return variantId.startsWith("variant_") ? variantId : null
}

function asArray(value: any): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === "object" && typeof value.toArray === "function") return value.toArray()
  return [value]
}

function priceUnavailableError(details: Record<string, any>) {
  const error: any = new Error("Price is unavailable for this product in the selected market.")
  error.status = 422
  error.code = PRICE_UNAVAILABLE_CODE
  error.details = details
  return error
}

function quoteValidationError(code: string, message: string, status: number, details: Record<string, any> = {}) {
  const error: any = new Error(message)
  error.status = status
  error.code = code
  error.details = details
  return error
}

function normalizeSourceType(value: any): "variant" | "custom" | null {
  const source = String(value || "").trim().toLowerCase()
  if (["variant", "catalog", "product", "medusa_variant"].includes(source)) return "variant"
  if (["custom", "manual"].includes(source)) return "custom"
  return null
}

/**
 * Converts a decimal dollar value (e.g. 0.05) to minor units (e.g. 5).
 * Throws if the value is not a positive finite number.
 */
function decimalToMinor(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid price: ${value}`)
  }
  return Math.round(n * 100)
}

/**
 * Normalizes a manually-typed quote row (no variant_id) into the internal
 * snapshot format. NEVER calls calculatePrices.
 */
function normalizeManualQuoteItem(item: QuoteItemInput) {
  const quantity = Number((item as any).quantity || (item as any).qty || 0)

  const unitPriceDecimal = Number(
    item.unit_price ??
    (item as any).unitPrice ??
    item.price ??
    0
  )

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be greater than 0")
  }

  if (!Number.isFinite(unitPriceDecimal) || unitPriceDecimal <= 0) {
    throw new Error("Price must be greater than 0")
  }

  const unitPriceMinor = decimalToMinor(unitPriceDecimal)

  return {
    product_id: (item as any).product_id || null,
    variant_id: null,
    source_type: "custom",
    title:
      item.title ||
      (item as any).product_title ||
      (item as any).product ||
      (item as any).name ||
      "Custom B2B Quote Item",
    sku: item.sku || null,
    quantity,
    original_quantity: quantity,
    original_unit_price: unitPriceMinor,
    unit_price: unitPriceMinor,
    total: unitPriceMinor * quantity,
    line_total: unitPriceMinor * quantity,
    original_line_total: unitPriceMinor * quantity,
    negotiated_line_total: unitPriceMinor * quantity,
    requested_unit_price: unitPriceMinor,
    negotiated_unit_price: unitPriceMinor,
    current_calculated_unit_price: unitPriceMinor,
    note: item.note || null,
    metadata: {
      source: "manual_b2b_quote_item",
      original_unit_price_decimal: unitPriceDecimal,
    },
  }
}

/**
 * Builds a safe B2B pricing context object. currency_code is ALWAYS present.
 */
function buildB2BPricingContext({
  body,
  customerId,
  company,
  resolvedCurrencyCode,
  resolvedRegionId,
  resolvedCountryCode,
  resolvedSalesChannelId,
  resolvedCustomerGroupId,
}: {
  body?: Record<string, any>
  customerId?: string | null
  company?: Record<string, any> | null
  resolvedCurrencyCode: string
  resolvedRegionId?: string | null
  resolvedCountryCode?: string | null
  resolvedSalesChannelId?: string | null
  resolvedCustomerGroupId?: string | null
}) {
  return {
    currency_code: resolvedCurrencyCode || "cad",
    region_id: resolvedRegionId || undefined,
    country_code: resolvedCountryCode || undefined,
    sales_channel_id: resolvedSalesChannelId || undefined,
    customer_id: customerId || undefined,
    customer_group_id: resolvedCustomerGroupId || undefined,
  }
}

function displayedUnitPriceMinor(item: QuoteItemInput): number | null {
  const explicitMinor = Number(item.displayed_unit_price_minor)
  if (Number.isFinite(explicitMinor) && explicitMinor > 0) {
    return Math.round(explicitMinor)
  }

  const decimal = Number(item.displayed_unit_price)
  if (Number.isFinite(decimal) && decimal > 0) {
    return Math.round(decimal * 100)
  }

  return null
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function getQuoteItems(q: any) {
  const items = q.negotiated_items || q.requested_items || q.items || q.metadata?.items || []
  return Array.isArray(items) ? items : []
}

function calculateQuoteItemsTotal(items: any[]) {
  return items.reduce((sum, item) => {
    const lineTotal = item.total ?? item.line_total ?? item.subtotal
    if (Number.isFinite(Number(lineTotal))) {
      return sum + Number(lineTotal)
    }

    const unitPrice =
      item.negotiated_unit_price ??
      item.unit_price ??
      item.requested_unit_price ??
      item.current_calculated_unit_price ??
      0

    return sum + toNumber(unitPrice) * toNumber(item.quantity)
  }, 0)
}

async function resolveVariantPriceSetIds(query: any, variantIds: string[]) {
  const { data: links } = await query.graph({
    entity: "product_variant_price_set",
    fields: ["variant_id", "price_set_id"],
    filters: { variant_id: variantIds },
  })

  const priceSetByVariantId = new Map<string, string>()
  for (const link of links || []) {
    if (link.variant_id && link.price_set_id) {
      priceSetByVariantId.set(link.variant_id, link.price_set_id)
    }
  }

  return priceSetByVariantId
}

async function resolveB2BPriceListPriceMap(query: any, currencyCode: string) {
  const priceBySetId = new Map<string, number>()

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
    ],
    filters: { title: B2B_PRICE_LIST_TITLE, status: "active" },
    pagination: { take: 10 },
  })

  const priceList = (priceLists || [])[0]
  if (!priceList) return priceBySetId

  for (const price of asArray(priceList.prices)) {
    if (!price?.price_set_id) continue
    if (String(price.currency_code || "").toLowerCase() !== currencyCode) continue
    const amount = Number(price.amount)
    if (Number.isFinite(amount) && amount > 0) {
      priceBySetId.set(price.price_set_id, Math.round(amount))
    }
  }

  return priceBySetId
}

function resolvedCalculatedAmount(variant: any, currencyCode: string) {
  const calculated = variant?.calculated_price
  const calculatedCurrency = String(calculated?.currency_code || currencyCode || "").toLowerCase()
  if (calculatedCurrency && calculatedCurrency !== currencyCode) {
    return 0
  }

  const amount = Number(
    calculated?.calculated_amount ??
      calculated?.amount ??
      calculated?.calculated_price?.amount ??
      0
  )

  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
}

async function calculatePriceSetAmount({
  pricingService,
  priceSetId,
  pricingContext,
}: {
  pricingService: any
  priceSetId?: string | null
  pricingContext: Record<string, any>
}) {
  if (!priceSetId) return 0

  try {
    const calcContext: Record<string, any> = {
      currency_code: pricingContext.currency_code,
    }
    if (pricingContext.region_id) calcContext.region_id = pricingContext.region_id
    if (pricingContext.customer_id) calcContext.customer_id = pricingContext.customer_id
    if (pricingContext.customer_group_id) calcContext.customer_group_id = pricingContext.customer_group_id

    const pricingResult = await pricingService.calculatePrices(
      { id: [priceSetId] },
      calcContext
    )
    const calculated = asArray(pricingResult)[0]
    const amount = Number(
      calculated?.calculated_amount ??
        calculated?.amount ??
        calculated?.original_amount ??
        0
    )
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
  } catch (error: any) {
    console.warn(
      `[B2B Quotes] Pricing calculation failed for price set ${priceSetId}:`,
      error?.message || error
    )
    return 0
  }
}

function findVariantEmbeddedPrice(variant: any, currencyCode: string) {
  const prices = asArray(variant?.prices)
  const exact = prices.find((price) => String(price?.currency_code || "").toLowerCase() === currencyCode)
  const amount = Number(exact?.amount)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
}

function formatStoreQuote(q: any) {
  const items = getQuoteItems(q)
  const fallbackTotal = calculateQuoteItemsTotal(items)
  const requestedTotal = toNumber(q.requested_total ?? q.subtotal, fallbackTotal)
  const total = getQuoteFinalPayableTotalMinor({
    ...q,
    total: q.negotiated_total ?? q.total ?? q.requested_total ?? q.subtotal ?? fallbackTotal,
  })
  const originalTotal = getQuoteOriginalTotalMinor(q)
  const negotiatedTotal = q.negotiated_total == null ? null : getQuoteNegotiatedTotalMinor(q)
  const commissionFields = quoteCommissionResponseFields({
    ...q,
    negotiated_total: negotiatedTotal ?? total,
    total,
  })

  return {
    id: q.id,
    company_id: q.company_id,
    company_name: q.company_name || q.company?.company_name || q.metadata?.company_name || null,
    customer_id: q.customer_id,
    customer_email: q.customer_email || q.email || q.metadata?.customer_email || null,
    customer_name: q.customer_name || q.metadata?.customer_name || null,
    status: q.status,
    requested_items: Array.isArray(q.requested_items) ? q.requested_items : items,
    requested_total: requestedTotal,
    original_total: originalTotal,
    negotiated_items: Array.isArray(q.negotiated_items) ? q.negotiated_items : null,
    negotiated_total: negotiatedTotal,
    ...commissionFields,
    quote_adjustment_total: quoteAdjustmentTotalMinor({
      ...q,
      original_total: originalTotal,
      negotiated_total: negotiatedTotal ?? total,
    }),
    payment_state: q.payment_state || "not_required",
    payment_terms: q.payment_terms || q.metadata?.payment_terms || null,
    payment_due_date: q.payment_due_date || null,
    payment_collection_id: q.payment_collection_id || q.metadata?.payment_collection_id || null,
    selected_payment_provider_id: q.selected_payment_provider_id || q.metadata?.selected_payment_provider_id || null,
    offer_version: q.offer_version || 1,
    items,
    item_count: items.length,
    items_count: items.length,
    total_units: items.reduce((sum, item) => sum + toNumber(item.quantity), 0),
    subtotal: requestedTotal,
    total,
    buyer_note: q.buyer_note,
    admin_note: q.admin_note,
    rejection_reason: q.rejection_reason,
    expires_at: q.expires_at,
    sent_at: q.sent_at,
    accepted_at: q.accepted_at,
    rejected_at: q.rejected_at,
    paid_at: q.paid_at,
    created_cart_id: q.created_cart_id,
    created_order_id: q.created_order_id,
    admin_notes: q.admin_note || q.admin_notes,
    customer_note: q.buyer_note || q.customer_note,
    cart_id: q.created_cart_id || q.cart_id,
    order_id: q.created_order_id || q.order_id || q.metadata?.order_id || null,
    converted_order_id: q.created_order_id || q.order_id || q.metadata?.converted_order_id || null,
    currency_code: q.currency_code,
    region_id: q.region_id || q.metadata?.region_id || null,
    country_code: q.country_code || q.metadata?.country_code || null,
    sales_channel_id: q.sales_channel_id || q.metadata?.sales_channel_id || null,
    created_at: q.created_at,
    updated_at: q.updated_at,
    metadata: q.metadata,
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  GET /store/b2b/quotes
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as any).auth_context
  const customerId: string | null = authContext?.actor_id ?? null

  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)

    const { status, offset, limit } = req.query as Record<string, string | undefined>

    const filters: Record<string, any> = { customer_id: customerId }
    if (status) filters.status = status

    const skip = Math.max(0, parseInt(offset || "0", 10) || 0)
    const take = Math.min(Math.max(1, parseInt(limit || "50", 10) || 50), 100)

    const [quotes, count] = await b2bService.listAndCountQuotes(filters, {
      skip,
      take,
      order: { created_at: "DESC" },
    })

    console.log(
      `[B2B Quotes] Customer ${customerId} listed their quotes: ${count} total`
    )

    return res.json({
      quotes: quotes.map(formatStoreQuote),
      count,
      offset: skip,
      limit: take,
    })
  } catch (error: any) {
    console.error("[B2B Quotes] List error:", error)

    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to list quotes" })
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  POST /store/b2b/quotes
//
//  PROOF LOG at top: [B2B_QUOTES_POST_REACHED] — if this never appears in
//  backend terminal then the server is running a stale compiled build.
//
//  Manual rows (no variant_id) NEVER call calculatePrices.
//  Variant rows call calculatePrices only when variantItems.length > 0
//  and currency_code is always explicitly injected.
// ────────────────────────────────────────────────────────────────────────────
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // ── PROOF LOG ─────────────────────────────────────────────────────────────
  // If this log does not appear in backend terminal, the server is running
  // a stale compiled build from .medusa/server. Rebuild with: npm run build
  console.log("[B2B_QUOTES_POST_REACHED]", {
    time: new Date().toISOString(),
    url: (req as any).url,
    method: (req as any).method,
    hasBody: !!(req as any).body,
    hasValidatedBody: !!(req as any).validatedBody,
    bodyKeys: Object.keys((req as any).validatedBody || (req as any).body || {}),
  })

  const authContext = (req as any).auth_context
  const customerId: string | null = authContext?.actor_id ?? null

  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  // ── Normalize request body ────────────────────────────────────────────────
  const body = ((req as any).validatedBody || (req as any).body || {}) as QuoteRequestBody

  // Hard fallback — currencyCode is NEVER undefined after this line
  const currencyCode: string = String(
    body.currency_code ||
    (body as any).currencyCode ||
    "cad"
  ).toLowerCase()

  const {
    cart_id,
    note,
    items,
    buyer_note,
    region_id,
    country_code,
    sales_channel_id,
    customer_group_id,
  } = body

  // ── Debug body log ────────────────────────────────────────────────────────
  console.log("[B2B_QUOTES_BODY_DEBUG]", {
    currency_code: body.currency_code,
    currencyCode: (body as any).currencyCode,
    company_id: (body as any).company_id,
    customer_group_id: body.customer_group_id,
    itemCount: Array.isArray(items) ? items.length : 0,
    items: Array.isArray(items)
      ? items.map((i: any) => ({
          title: i.title || i.product || i.product_title || i.name,
          sku: i.sku,
          variant_id: i.variant_id,
          quantity: i.quantity,
          price: i.price,
          unit_price: i.unit_price,
          unitPrice: i.unitPrice,
        }))
      : [],
  })

  // ── Cart-based quote (fast path) ──────────────────────────────────────────
  if (cart_id) {
    try {
      const { result } = await createRequestForQuoteWorkflow(req.scope).run({
        input: {
          cart_id,
          customer_id: customerId,
          note: note || buyer_note,
        },
      })

      return res.status(201).json({
        quote: {
          id: result.id,
          status: result.status,
          customer_id: result.customer_id,
          company_id: result.company_id,
          cart_id: result.cart_id || result.created_cart_id,
          draft_order_id: result.draft_order_id,
          order_change_id: result.order_change_id,
          created_at: result.created_at,
        },
      })
    } catch (error: any) {
      console.error("[B2B Quotes] Cart submit error:", error)
      const status = Number.isInteger(error?.status)
        ? error.status
        : error instanceof MedusaError && error.type === "not_found"
          ? 404
          : 400

      return res.status(status).json({
        message: error.message || "Failed to submit quote request",
      })
    }
  }

  // ── 1. Validate items array ───────────────────────────────────────────────
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "Please enter valid quote items with quantity and price.",
    })
  }

  for (const [i, item] of items.entries()) {
    const qty = Number(item.quantity)
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({
        message: `Item at row ${i + 1} must have a positive quantity.`,
      })
    }
    const sourceType = normalizeSourceType(item.source_type)
    const variantId = normalizeVariantId(item.variant_id)

    if (sourceType === "variant" && !variantId) {
      return res.status(400).json({
        code: VARIANT_REQUIRED_CODE,
        message: "variant_id is required for catalog quote items.",
        details: { row: i + 1 },
      })
    }

    if (!variantId) {
      const price = Number(item.unit_price ?? (item as any).price ?? (item as any).unitPrice ?? 0)
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({
          message: `Item at row ${i + 1} must have a positive price.`,
        })
      }
      const title = item.title || (item as any).product_title || (item as any).product || (item as any).name || ""
      if (!String(title).trim()) {
        return res.status(400).json({
          message: `Item at row ${i + 1} is missing a product title.`,
        })
      }
    }
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const customerModule: any = req.scope.resolve(Modules.CUSTOMER)
    const query = req.scope.resolve("query")

    // ── 2. Resolve the authenticated customer ─────────────────────────────
    const customer = await customerModule.retrieveCustomer(customerId)
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" })
    }

    // ── 3. Resolve the customer's linked B2B Company ──────────────────────
    const { data: customerRows } = await query.graph({
      entity: "customer",
      fields: [
        "company.id",
        "company.company_name",
        "company.status",
        "company.metadata",
      ],
      filters: { id: customerId },
    })

    const company = customerRows?.[0]?.company ?? null

    if (!company) {
      return res.status(400).json({
        message:
          "No B2B company linked to your account. " +
          "Please register your company at /store/b2b/company first.",
      })
    }

    if (company.status !== "active" && company.status !== "approved") {
      return res.status(403).json({
        message: `Your company is ${company.status}. Only approved companies can submit quote requests.`,
      })
    }

    // ── 4. Resolve pricing context — currency_code ALWAYS present ─────────
    let resolvedCurrencyCode: string = normalizeCurrencyCode(currencyCode)
    let resolvedRegionId: string | null = region_id || (body as any).regionId || null
    let resolvedCountryCode: string | null = normalizeCountryCode(
      country_code || (body as any).countryCode || null
    )
    let resolvedSalesChannelId: string | null =
      sales_channel_id ||
      (body as any).salesChannelId ||
      ((req as any).publishable_key_context?.sales_channel_ids || [])[0] ||
      null
    let resolvedCustomerGroupId: string | null =
      customer_group_id ||
      (body as any).customerGroupId ||
      (company as any)?.customer_group_id ||
      (company as any)?.metadata?.customer_group_id ||
      (customer as any)?.metadata?.customer_group_id ||
      null

    if (!resolvedRegionId) {
      const metaRegionId: string | null =
        (customer as any).metadata?.region_id ||
        (customer as any).metadata?.default_region_id ||
        null

      if (metaRegionId) {
        resolvedRegionId = metaRegionId
      } else {
        const { data: regions } = await query.graph({
          entity: "region",
          fields: ["id", "currency_code", "countries.iso_2"],
          pagination: { take: 1 },
        })
        if (regions && regions.length > 0) {
          resolvedRegionId = regions[0].id
          if (!resolvedCountryCode) {
            resolvedCountryCode = normalizeCountryCode(regions[0]?.countries?.[0]?.iso_2)
          }
          if (!body.currency_code && !(body as any).currencyCode) {
            resolvedCurrencyCode = normalizeCurrencyCode(regions[0].currency_code)
          }
        }
      }
    }

    // Final safety — currency_code must never be empty
    if (!resolvedCurrencyCode) {
      resolvedCurrencyCode = "cad"
    }

    if (resolvedRegionId) {
      const { data: regions } = await query.graph({
        entity: "region",
        fields: ["id", "currency_code", "countries.iso_2"],
        filters: { id: resolvedRegionId },
        pagination: { take: 1 },
      })
      const region = regions?.[0]

      if (!region) {
        throw quoteValidationError(
          MARKET_MISMATCH_CODE,
          "Selected quote region is unavailable.",
          422,
          { region_id: resolvedRegionId, currency_code: resolvedCurrencyCode }
        )
      }

      const regionCurrency = normalizeCurrencyCode(region.currency_code)
      if (!resolvedCountryCode) {
        resolvedCountryCode = normalizeCountryCode(region?.countries?.[0]?.iso_2)
      }
      if (regionCurrency !== resolvedCurrencyCode) {
        throw quoteValidationError(
          MARKET_MISMATCH_CODE,
          "Quote currency must match the selected region.",
          422,
          { region_id: resolvedRegionId, region_currency_code: regionCurrency, currency_code: resolvedCurrencyCode }
        )
      }
    }

    const pricingContext = buildB2BPricingContext({
      body: body as any,
      customerId,
      company,
      resolvedCurrencyCode,
      resolvedRegionId,
      resolvedCountryCode,
      resolvedSalesChannelId,
      resolvedCustomerGroupId,
    })

    // ── 5. Split items: manual vs variant ────────────────────────────────
    const rawItems = Array.isArray(items) ? items : []
    const manualItems: any[] = []
    const variantItems: any[] = []

    for (const item of rawItems) {
      const sourceType = normalizeSourceType(item.source_type)
      const variantId = normalizeVariantId(item.variant_id)
      if (!variantId && sourceType === "variant") {
        throw quoteValidationError(
          VARIANT_REQUIRED_CODE,
          "variant_id is required for catalog quote items.",
          400,
          { item }
        )
      }
      if (!variantId) {
        manualItems.push(normalizeManualQuoteItem(item))
      } else {
        variantItems.push({ ...item, source_type: "variant", variant_id: variantId })
      }
    }

    console.log("[B2B_QUOTES_ITEM_SPLIT]", {
      manualCount: manualItems.length,
      variantCount: variantItems.length,
    })

    let requested_items: any[] = [...manualItems]

    if (variantItems.length > 0) {
      const resolvedVariantItems = await Promise.all(
        variantItems.map(async (item) => {
          const quantity = Number(item.quantity || 0)
          const resolvedPrice = await resolveCommercialVariantPrice({
            container: req.scope,
            variantId: item.variant_id,
            regionId: resolvedRegionId,
            countryCode: resolvedCountryCode,
            currencyCode: resolvedCurrencyCode,
            salesChannelId: resolvedSalesChannelId,
            customerId,
            customerGroupId: resolvedCustomerGroupId,
            quantity,
          })
          const productTitle = resolvedPrice.productTitle || item.title || ""
          const variantTitle = resolvedPrice.variantTitle || ""
          const title = variantTitle
            ? `${productTitle} - ${variantTitle}`
            : productTitle || "Unknown Product"
          const sku = resolvedPrice.sku || item.sku || null
          const unitPriceMinor = resolvedPrice.amountMinor
          const frontendAmount = displayedUnitPriceMinor(item)

          if (process.env.NODE_ENV !== "production") {
            console.log("[B2B_PRICE_CONTEXT]", {
              variantId: item.variant_id,
              sku,
              regionId: resolvedRegionId,
              countryCode: resolvedCountryCode,
              currencyCode: resolvedCurrencyCode,
              salesChannelId: resolvedSalesChannelId,
              priceSetId: resolvedPrice.priceSetId,
              resolvedAmount: unitPriceMinor,
              source: resolvedPrice.source,
              displayedAmount: frontendAmount,
            })
          }

          if (unitPriceMinor <= 0) {
            throw priceUnavailableError({
              variant_id: item.variant_id,
              sku,
              currency_code: resolvedCurrencyCode,
              region_id: resolvedRegionId,
              country_code: resolvedCountryCode,
              sales_channel_id: resolvedSalesChannelId,
              price_set_id: resolvedPrice.priceSetId,
            })
          }

          if (
            process.env.NODE_ENV !== "production" &&
            frontendAmount !== null &&
            frontendAmount !== unitPriceMinor
          ) {
            throw quoteValidationError(
              PRICE_CONTEXT_MISMATCH_CODE,
              "Storefront and backend quote price contexts resolved different prices.",
              409,
              {
                sku,
                frontend_amount: frontendAmount,
                backend_amount: unitPriceMinor,
                currency_code: resolvedCurrencyCode,
              }
            )
          }

          const lineTotalMinor = unitPriceMinor * quantity

          return {
            product_id: item.product_id || resolvedPrice.productId || null,
            variant_id: item.variant_id || null,
            source_type: "variant",
            title,
            sku,
            quantity,
            original_quantity: quantity,
            original_unit_price: unitPriceMinor,
            unit_price: unitPriceMinor,
            total: lineTotalMinor,
            line_total: lineTotalMinor,
            original_line_total: lineTotalMinor,
            negotiated_line_total: lineTotalMinor,
            requested_unit_price: unitPriceMinor,
            negotiated_unit_price: unitPriceMinor,
            current_calculated_unit_price: unitPriceMinor,
            note: item.note || null,
            metadata: {
              source: "b2b_quote_variant_item",
              price_source: resolvedPrice.source,
              calculated_price_type: resolvedPrice.calculatedPriceType,
              price_set_id: resolvedPrice.priceSetId,
              region_id: resolvedRegionId,
              country_code: resolvedCountryCode,
              sales_channel_id: resolvedSalesChannelId,
              currency_code: resolvedCurrencyCode,
              displayed_unit_price_minor: frontendAmount,
            },
          }
        })
      )

      requested_items = requested_items.concat(resolvedVariantItems)
      variantItems.splice(0, variantItems.length)
    }

    // ── 6. Variant items — the ONLY place calculatePrices is called ───────
    if (variantItems.length > 0) {
      const pricingService: any = req.scope.resolve(Modules.PRICING)
      const variantMap = new Map<string, any>()
      const priceSetByVariantId = new Map<string, string>()
      const b2bPriceBySetId = new Map<string, number>()
      console.log("[B2B_QUOTES_PRICING_CONTEXT]", {
        currency_code: pricingContext.currency_code,
        region_id: pricingContext.region_id,
        country_code: pricingContext.country_code,
        sales_channel_id: pricingContext.sales_channel_id,
        has_customer_id: !!pricingContext.customer_id,
        has_customer_group_id: !!pricingContext.customer_group_id,
      })

      const resolvedVariantItems = await Promise.all(
        variantItems.map(async (item) => {
          const variant = variantMap.get(item.variant_id)
          const productTitle = variant?.product?.title || item.title || ""
          const variantTitle = variant?.title || ""
          const title = variantTitle
            ? `${productTitle} - ${variantTitle}`
            : productTitle || "Unknown Product"
          const sku = variant?.sku || item.sku || null
          const quantity = Number(item.quantity || 0)

          let currentCalculatedPrice = 0
          let currentUnitPrice = 0

          const priceSetId =
            priceSetByVariantId.get(item.variant_id) ||
            asArray(variant?.prices).find((p: any) => p?.price_set_id)?.price_set_id ||
            null

          if (priceSetId && b2bPriceBySetId.has(priceSetId)) {
            currentCalculatedPrice = b2bPriceBySetId.get(priceSetId) || 0
          }

          if (currentCalculatedPrice <= 0) {
            currentUnitPrice = findVariantEmbeddedPrice(variant, resolvedCurrencyCode)
          }

          if (priceSetId && currentCalculatedPrice <= 0 && currentUnitPrice <= 0) {
            // Safety guard before calculatePrices call
            if (!pricingContext.currency_code) {
              pricingContext.currency_code = "cad"
            }
            try {
              // Medusa v2: pricingService.calculatePrices(filters, context)
              // The context object is the DIRECT second argument — NOT nested under { context: {...} }
              const calcContext: Record<string, any> = {
                currency_code: pricingContext.currency_code || "cad",
              }
              // Only add optional fields if they are defined — Medusa rejects null/undefined context keys
              if (pricingContext.region_id) calcContext.region_id = pricingContext.region_id
              if (pricingContext.customer_id) calcContext.customer_id = pricingContext.customer_id
              if (pricingContext.customer_group_id) calcContext.customer_group_id = pricingContext.customer_group_id

              const pricingResult = await pricingService.calculatePrices(
                { id: [priceSetId] },
                calcContext
              )
              if (pricingResult && pricingResult.length > 0) {
                currentCalculatedPrice =
                  pricingResult[0].calculated_amount ||
                  pricingResult[0].amount ||
                  pricingResult[0].original_amount ||
                  0
              }
            } catch (pricingError: any) {
              if (
                pricingError?.message?.includes("calculatePrices requires currency_code") ||
                pricingError?.message?.includes("currency_code in the pricing context")
              ) {
                console.error("[B2B_QUOTES_CALCULATE_PRICES_CONTEXT_ERROR]", {
                  pricingContext,
                  variantId: item.variant_id,
                })
              }
              console.warn(
                `[B2B Quotes] Pricing calculation failed for variant ${item.variant_id}:`,
                pricingError.message
              )
              // Non-fatal: fall through to default price lookup below
            }
          }

          const unitPriceMinor = currentCalculatedPrice || currentUnitPrice || 0
          if (process.env.NODE_ENV !== "production") {
            console.log("[B2B_QUOTE_PRICE_RESOLUTION]", {
              variantId: item.variant_id,
              sku,
              regionId: resolvedRegionId,
              currencyCode: resolvedCurrencyCode,
              salesChannelId: resolvedSalesChannelId,
              resolvedAmount: unitPriceMinor,
              calculatedAmount: currentCalculatedPrice || null,
              embeddedCurrencyAmount: currentUnitPrice || null,
              displayedAmount: item.displayed_unit_price_minor ?? item.displayed_unit_price ?? item.unit_price ?? null,
            })
          }
          if (unitPriceMinor <= 0) {
            throw priceUnavailableError({
              variant_id: item.variant_id,
              sku,
              currency_code: resolvedCurrencyCode,
              region_id: resolvedRegionId,
              price_set_id: priceSetId,
            })
          }

          const lineTotalMinor = unitPriceMinor * quantity

          return {
            product_id: item.product_id || variant?.product?.id || null,
            variant_id: item.variant_id || null,
            source_type: "variant",
            title,
            sku,
            quantity,
            original_quantity: quantity,
            original_unit_price: unitPriceMinor,
            unit_price: unitPriceMinor,
            total: lineTotalMinor,
            line_total: lineTotalMinor,
            original_line_total: lineTotalMinor,
            negotiated_line_total: lineTotalMinor,
            requested_unit_price: unitPriceMinor,
            negotiated_unit_price: unitPriceMinor,
            current_calculated_unit_price: currentCalculatedPrice || currentUnitPrice,
            note: item.note || null,
            metadata: {
              source: "b2b_quote_variant_item",
              price_source:
                currentCalculatedPrice > 0 && priceSetId && b2bPriceBySetId.has(priceSetId)
                  ? "b2b_price_list"
                  : currentCalculatedPrice > 0
                    ? "medusa_calculated_price"
                    : "variant_embedded_price",
              price_set_id: priceSetId,
              region_id: resolvedRegionId,
              sales_channel_id: resolvedSalesChannelId,
              currency_code: resolvedCurrencyCode,
            },
          }
        })
      )

      requested_items = requested_items.concat(resolvedVariantItems)
    }

    // ── 7. Calculate total ────────────────────────────────────────────────
    const requested_total = requested_items.reduce(
      (sum, item) => sum + item.requested_unit_price * item.quantity,
      0
    )

    if (requested_total <= 0) {
      throw priceUnavailableError({
        currency_code: resolvedCurrencyCode,
        region_id: resolvedRegionId,
        reason: "Quote total resolved to zero",
      })
    }

    // ── 8. Create the quote record ────────────────────────────────────────
    const quote = await b2bService.createQuotes({
      company_id: company.id,
      customer_id: customerId,
      customer_email: customer.email || "",
      status: "pending_merchant",
      customer_name:
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
      company_name: company.company_name,
      currency_code: resolvedCurrencyCode,
      region_id: resolvedRegionId,
      country_code: resolvedCountryCode,
      sales_channel_id: resolvedSalesChannelId,
      requested_items,
      requested_total,
      original_total: requested_total,
      negotiated_items: requested_items,
      negotiated_total: requested_total,
      quote_adjustment_total: 0,
      payment_state: "not_required",
      payment_terms: "due_on_receipt",
      payment_due_date: null,
      payment_collection_id: null,
      selected_payment_provider_id: null,
      offer_version: 1,
      buyer_note: buyer_note || null,
      admin_note: null,
      rejection_reason: null,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      sent_at: null,
      accepted_at: null,
      rejected_at: null,
      paid_at: null,
      created_cart_id: null,
      created_order_id: null,
      items: requested_items,
      subtotal: requested_total,
      total: requested_total,
      admin_notes: null,
      customer_note: buyer_note || null,
      requested_by: customerId,
      metadata: {
        customer_name:
          [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
        submitted_by: customerId,
        submitted_at: new Date().toISOString(),
        currency_code: resolvedCurrencyCode,
        region_id: resolvedRegionId,
        country_code: resolvedCountryCode,
        sales_channel_id: resolvedSalesChannelId,
        customer_group_id: resolvedCustomerGroupId,
        original_total: requested_total,
        negotiated_total: requested_total,
      },
    })

    console.log(
      `[B2B Quotes] Quote ${quote.id} created for customer ${customer.email} ` +
        `(company: ${company.company_name || company.id}, ` +
        `items: ${requested_items.length}, ` +
        `manual: ${manualItems.length}, variant: ${variantItems.length}, ` +
        `requested_total: ${requested_total}, currency: ${resolvedCurrencyCode})`
    )

    return res.status(201).json({
      message: "Quote request submitted for admin review.",
      quote: {
        id: quote.id,
        status: quote.status,
        currency_code: resolvedCurrencyCode,
        region_id: resolvedRegionId,
        country_code: resolvedCountryCode,
        sales_channel_id: resolvedSalesChannelId,
        subtotal: requested_total,
        total: requested_total,
        requested_items,
        requested_total,
        original_total: requested_total,
        negotiated_total: requested_total,
        buyer_note: buyer_note || null,
        items: requested_items,
        company_id: company.id,
        customer_id: customerId,
      },
    })
  } catch (error: any) {
    console.error("[B2B Quotes] Submit error:", error)

    if (error instanceof MedusaError) {
      const status = error.type === "not_found" ? 404 : 400
      return res.status(status).json({ message: error.message })
    }

    if (Number.isInteger(error?.status)) {
      return res.status(error.status).json({
        code: error.code,
        details: error.details,
        message: error.message || "Failed to submit quote request",
      })
    }

    return res.status(422).json({
      success: false,
      error: "Calculation context mismatch fallback triggered",
      message: error.message || "Failed to submit quote request",
    })
  }
}
