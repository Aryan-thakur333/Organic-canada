import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../modules/b2b"
import { Modules, MedusaError } from "@medusajs/framework/utils"

// ── Types ──────────────────────────────────────────────────────────────────

type QuoteItemInput = {
  product_id: string
  variant_id: string
  quantity: number
  note?: string
}

type QuoteRequestBody = {
  /** Array of line items the customer wants quoted */
  items: QuoteItemInput[]
  /** Optional notes or context for the admin reviewer */
  buyer_note?: string
  /** Optional currency_code override (defaults to "cad") */
  currency_code?: string
  /** Optional region_id override (defaults to first active region) */
  region_id?: string
}

// ────────────────────────────────────────────────────────────────────────────
//  GET /store/b2b/quotes
//
//  Returns the authenticated customer's own quote requests, ordered by
//  creation date descending (most recent first).
//
//  Query params:
//    - status : optional filter
//    - offset : pagination offset (default 0)
//    - limit  : pagination limit (default 50, max 100)
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
      quotes: quotes.map((q: any) => ({
        id: q.id,
        company_id: q.company_id,
        customer_id: q.customer_id,
        customer_email: q.customer_email,
        status: q.status,
        requested_items: q.requested_items,
        requested_total: q.requested_total,
        negotiated_items: q.negotiated_items,
        negotiated_total: q.negotiated_total,
        buyer_note: q.buyer_note,
        admin_note: q.admin_note,
        rejection_reason: q.rejection_reason,
        expires_at: q.expires_at,
        accepted_at: q.accepted_at,
        rejected_at: q.rejected_at,
        created_cart_id: q.created_cart_id,
        created_order_id: q.created_order_id,
        items: q.items || q.requested_items,
        subtotal: q.requested_total || q.subtotal || 0,
        total: q.negotiated_total || q.requested_total || q.total || 0,
        admin_notes: q.admin_note || q.admin_notes,
        customer_note: q.buyer_note || q.customer_note,
        cart_id: q.created_cart_id || q.cart_id,
        order_id: q.created_order_id || q.order_id,
        company_name: q.company_name,
        customer_name: q.customer_name,
        currency_code: q.currency_code,
        created_at: q.created_at,
        updated_at: q.updated_at,
      })),
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
//  Allows an authenticated B2B customer to submit a wholesale quote request.
//  The route:
//    1. Authenticates the customer via session
//    2. Resolves the customer's linked B2B Company via Remote Query
//    3. Validates the items payload
//    4. Fetches product/variant data from Medusa for snapshot
//    5. Builds requested_items snapshot with current pricing
//    6. Creates a 'pending_review' Quote record
//    7. Returns the created quote
//
//  PRICING CONTEXT BINDING:
//    The pricing calculation requires currency_code and region_id to be
//    explicitly bound. If the client does not supply them in the request
//    body, the handler falls back to the active customer context metadata
//    or the first available region/currency. This eliminates the
//    "Method calculatePrices requires currency_code" validation crash.
//
//  Request body:
//    {
//      "items": [
//        { "product_id": "prod_xxx", "variant_id": "variant_xxx",
//          "quantity": 50, "note": "Need bulk discount" }
//      ],
//      "buyer_note": "Monthly supply requirement",
//      "currency_code": "cad",
//      "region_id": "reg_xxx"
//    }
// ────────────────────────────────────────────────────────────────────────────
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as any).auth_context
  const customerId: string | null = authContext?.actor_id ?? null

  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const { items, buyer_note, currency_code, region_id } = req.body as QuoteRequestBody

  // ── 1. Validate the request body ─────────────────────────────────────
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "At least one item is required",
    })
  }

  for (const [i, item] of items.entries()) {
    if (!item.variant_id || typeof item.variant_id !== "string") {
      return res.status(400).json({
        message: `Item at index ${i} is missing a valid variant_id.`,
        field: `items[${i}].variant_id`,
        hint: "Send product_id, variant_id, and quantity from the selected B2B product variant."
      })
    }
    if (typeof item.quantity !== "number" || item.quantity < 1 || !Number.isInteger(item.quantity)) {
      return res.status(400).json({
        message: `Item at index ${i} has an invalid 'quantity' — must be a positive integer`,
      })
    }
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const customerModule: any = req.scope.resolve(Modules.CUSTOMER)
    const query = req.scope.resolve("query")
    const pricingService: any = req.scope.resolve(Modules.PRICING)
    const regionModule: any = req.scope.resolve(Modules.REGION)

    // ── 2. Resolve the authenticated customer ───────────────────────────
    const customer = await customerModule.retrieveCustomer(customerId)
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" })
    }

    // ── 3. Resolve the customer's linked B2B Company via Remote Query ───
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: [
        "company.id",
        "company.company_name",
        "company.status",
      ],
      filters: { id: customerId },
    })

    const company = customers?.[0]?.company ?? null

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

    // ── 4. Resolve pricing context (currency_code + region_id) ──────────
    // The pricing service requires both currency_code and region_id to be
    // explicitly bound. If the client does not supply them, fall back to
    // the customer metadata or the first available region/currency.
    let resolvedCurrencyCode: string = (currency_code || "cad").toLowerCase()
    let resolvedRegionId: string | null = region_id || null

    if (!resolvedRegionId) {
      // Try to resolve from customer metadata first
      const customerMetadataRegionId: string | undefined =
        (customer as any).metadata?.region_id ||
        (customer as any).metadata?.default_region_id ||
        null
      if (customerMetadataRegionId) {
        resolvedRegionId = customerMetadataRegionId
      } else {
        // Fall back to the first active region
        const { data: regions } = await query.graph({
          entity: "region",
          fields: ["id", "currency_code"],
          pagination: { take: 1 },
        })
        if (regions && regions.length > 0) {
          resolvedRegionId = regions[0].id
          if (!currency_code) {
            resolvedCurrencyCode = (regions[0].currency_code || "cad").toLowerCase()
          }
        }
      }
    }

    if (!resolvedRegionId) {
      return res.status(400).json({
        message: "No checkout region is configured. Please provide a region_id or ensure at least one region exists.",
      })
    }

    // ── 5. Fetch product/variant data for snapshot ──────────────────────
    const variantIds = items.map((item) => item.variant_id)
    const productIds = items.map((item) => item.product_id).filter(Boolean)

    // Fetch variants with their products via query graph
    const { data: variants } = await query.graph({
      entity: "variant",
      fields: [
        "id",
        "sku",
        "title",
        "product.id",
        "product.title",
        "prices.*",
        "calculated_price.*",
      ],
      filters: { id: variantIds },
    })

    // Build a lookup map for quick access
    const variantMap = new Map<string, any>()
    for (const v of variants) {
      variantMap.set(v.id, v)
    }

    // ── 6. Build requested_items snapshot with B2B pricing context ──────
    // The pricing context explicitly binds currency_code and region_id to
    // eliminate the "Method calculatePrices requires currency_code" crash.
    const requested_items = await Promise.all(
      items.map(async (item) => {
        const variant = variantMap.get(item.variant_id)
        const productTitle = variant?.product?.title || ""
        const variantTitle = variant?.title || ""
        const title = variantTitle
          ? `${productTitle} - ${variantTitle}`
          : productTitle || "Unknown Product"
        const sku = variant?.sku || null

        // Try to get calculated price using the pricing service with
        // explicit currency_code and region_id context binding.
        let currentCalculatedPrice = 0
        let currentUnitPrice = 0

        try {
          const pricingResult = await pricingService.calculatePrices(
            { id: [item.variant_id] },
            {
              context: {
                currency_code: resolvedCurrencyCode,
                region_id: resolvedRegionId,
              },
            }
          )
          if (pricingResult && pricingResult.length > 0) {
            currentCalculatedPrice = pricingResult[0].amount || 0
          }
        } catch (pricingError: any) {
          // If pricing calculation fails (e.g. no price set for this variant),
          // fall back to the variant's default price from the prices array.
          console.warn(
            `[B2B Quotes] Pricing calculation failed for variant ${item.variant_id}:`,
            pricingError.message
          )
        }

        // Fallback: use the variant's default price if calculated price is 0
        if (currentCalculatedPrice === 0 && variant?.prices && Array.isArray(variant.prices)) {
          const defaultPrice = variant.prices.find(
            (p: any) => p.currency_code === resolvedCurrencyCode
          )
          if (defaultPrice) {
            currentUnitPrice = defaultPrice.amount || 0
          }
        }

        return {
          product_id: item.product_id || variant?.product?.id || null,
          variant_id: item.variant_id,
          title,
          sku,
          quantity: item.quantity,
          requested_unit_price: currentUnitPrice || currentCalculatedPrice,
          current_calculated_unit_price: currentCalculatedPrice || currentUnitPrice,
          note: item.note || null,
        }
      })
    )

    // ── Calculate requested_total ───────────────────────────────────────
    const requested_total = requested_items.reduce(
      (sum, item) => sum + item.requested_unit_price * item.quantity,
      0
    )

    // ── 7. Create the quote record ─────────────────────────────────────
    const quote = await b2bService.createQuotes({
      company_id: company.id,
      customer_id: customerId,
      customer_email: customer.email || "",
      status: "pending_review",
      customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
      company_name: company.company_name,
      currency_code: resolvedCurrencyCode,
      requested_items,
      requested_total,
      negotiated_items: null,
      negotiated_total: null,
      buyer_note: buyer_note || null,
      admin_note: null,
      rejection_reason: null,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      accepted_at: null,
      rejected_at: null,
      created_cart_id: null,
      created_order_id: null,
      items: requested_items,
      subtotal: requested_total,
      total: requested_total,
      admin_notes: null,
      customer_note: buyer_note || null,
      metadata: {
        customer_name:
          [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
        submitted_by: customerId,
        submitted_at: new Date().toISOString(),
        currency_code: resolvedCurrencyCode,
        region_id: resolvedRegionId,
      },
    })

    console.log(
      `[B2B Quotes] Quote ${quote.id} created for customer ${customer.email} ` +
        `(company: ${company.company_name || company.id}, items: ${items.length}, ` +
        `requested_total: ${requested_total}, currency: ${resolvedCurrencyCode})`
    )

    // ── 8. Return the created quote ─────────────────────────────────────
    return res.status(201).json({
      message: "Quote request submitted for admin review.",
      quote: {
        id: quote.id,
        status: quote.status,
      },
    })
  } catch (error: any) {
    console.error("[B2B Quotes] Submit error:", error)

    if (error instanceof MedusaError) {
      const status = error.type === "not_found" ? 404 : 400
      return res.status(status).json({ message: error.message })
    }

    return res.status(500).json({
      message: error.message || "Failed to submit quote request",
    })
  }
}