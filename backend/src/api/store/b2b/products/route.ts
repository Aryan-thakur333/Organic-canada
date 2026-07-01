import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

const B2B_PRICE_LIST_TITLE = "B2B customer"

/**
 * Retrieve the authenticated customer ID from the auth context.
 */
function getCustomerId(req: MedusaRequest): string | null {
  const authContext = (req as any).auth_context
  return (
    (authContext?.customer_id as string | undefined) ??
    (authContext?.actor_id as string | undefined) ??
    null
  )
}

/**
 * Safe array wrapper – handles null, undefined, single objects, and toArray().
 */
function asArray(value: any): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === "object" && typeof (value as any).toArray === "function")
    return (value as any).toArray()
  return [value]
}

/**
 * ---------------------------------------------------------------------------
 * Permanent B2B vs B2C Price Catalog Isolation Engine
 *
 * Medusa v2 Remote Query API – B2B Products
 *
 * Strategy:
 *  1. Verify the customer has an approved/active B2B company.
 *  2. Use Remote Query to fetch the active price list whose title matches
 *     "B2B customer" (or type === "override"), including its prices.
 *  3. Collect all unique price_set_id values from those prices.
 *  4. Use Remote Query to find which variants are linked to those price sets
 *     via the product_variant_price_set link entity.
 *  5. Use Remote Query to fetch full product entities populated with those
 *     specific variants (including calculated price context).
 *  6. Return a clean JSON envelope with the B2B-only response key:
 *     { products: normalizedB2BItemsArray, ... }
 *
 * B2C RETAIL EXCLUSION:
 *   - Only variants that have a price_set_id linked to the "B2B customer"
 *     price list are included. No B2C pricing, no retail catalog fallback.
 *   - The response key "products" is populated exclusively from the B2B
 *     price list override chain. No retail price calculation or B2C product
 *     querying pollutes this endpoint.
 * ---------------------------------------------------------------------------
 */

async function findB2BPriceList(query: any): Promise<any | null> {
  // Fetch price list(s) by title using Remote Query
  const { data: priceLists } = await query.graph({
    entity: "price_list",
    fields: [
      "id",
      "title",
      "type",
      "status",
      "starts_at",
      "ends_at",
      "prices.id",
      "prices.price_set_id",
      "prices.amount",
      "prices.currency_code",
      "prices.min_quantity",
      "prices.max_quantity",
      "prices.price_rules.id",
      "prices.price_rules.attribute",
      "prices.price_rules.value",
    ],
    filters: {
      title: B2B_PRICE_LIST_TITLE,
      status: "active",
    },
    pagination: { take: 10 },
  })

  if (!priceLists || priceLists.length === 0) {
    // Fallback: try by type "override"
    const { data: overrideLists } = await query.graph({
      entity: "price_list",
      fields: [
        "id",
        "title",
        "type",
        "status",
        "starts_at",
        "ends_at",
        "prices.id",
        "prices.price_set_id",
        "prices.amount",
        "prices.currency_code",
        "prices.min_quantity",
        "prices.max_quantity",
        "prices.price_rules.id",
        "prices.price_rules.attribute",
        "prices.price_rules.value",
      ],
      filters: {
        type: "override",
        status: "active",
      },
      pagination: { take: 10 },
    })
    if (!overrideLists || overrideLists.length === 0) return null
    // Prefer the one with the matching title; otherwise use the first override list
    return (
      overrideLists.find((pl: any) => pl.title === B2B_PRICE_LIST_TITLE) ??
      overrideLists[0]
    )
  }

  // Prefer the matching title, already filtered above
  return priceLists[0]
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    // ── 1. Auth guard ────────────────────────────────────────────────────
    const customerId = getCustomerId(req)
    if (!customerId) {
      return res.status(401).json({ message: "Customer login required" })
    }

    // ── 2. Resolve B2B company ──────────────────────────────────────────
    const query = req.scope.resolve("query")

    const { data: customers } = await query.graph({
      entity: "customer",
      fields: [
        "id",
        "company.id",
        "company.company_name",
        "company.status",
      ],
      filters: { id: customerId },
    })

    const customer = customers?.[0]
    const company = Array.isArray(customer?.company)
      ? customer.company[0]
      : customer?.company ?? null

    if (!company || (company.status !== "approved" && company.status !== "active")) {
      return res.status(403).json({
        message: "Approved B2B company access required",
        company: company
          ? {
              id: company.id,
              company_name: company.company_name,
              status: company.status,
            }
          : null,
      })
    }

    // ── 3. Resolve region / currency ─────────────────────────────────────
    const regionQuery = req.query?.region_id
    let regionId: string | null =
      typeof regionQuery === "string" ? regionQuery : null
    if (!regionId) {
      const { data: regions } = await query.graph({
        entity: "region",
        fields: ["id"],
        pagination: { take: 1 },
      })
      regionId = regions?.[0]?.id ?? null
    }

    if (!regionId) {
      return res.status(400).json({ message: "Store region is unavailable" })
    }

    const currencyCode = String(req.query?.currency_code || "cad").toLowerCase()
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 48))
    const offset = Math.max(0, Number(req.query?.offset) || 0)

    // ── 4. Find the B2B price list ───────────────────────────────────────
    const priceList = await findB2BPriceList(query)
    if (!priceList) {
      return res.status(200).json({
        products: [],
        count: 0,
        fallback_active: true,
        price_list: null,
        company: {
          id: company.id,
          company_name: company.company_name,
          status: company.status,
        },
      })
    }

    const prices = asArray(priceList.prices)
    const priceSetIds: string[] = []
    for (const p of prices) {
      if (p.price_set_id) priceSetIds.push(p.price_set_id)
    }

    const uniquePriceSetIds = Array.from(new Set(priceSetIds))
    if (uniquePriceSetIds.length === 0) {
      return res.status(200).json({
        products: [],
        count: 0,
        fallback_active: true,
        price_list: { id: priceList.id, title: priceList.title, type: priceList.type, status: priceList.status },
        company: {
          id: company.id,
          company_name: company.company_name,
          status: company.status,
        },
      })
    }

    // ── 5. Resolve variant IDs from price set IDs ────────────────────────
    const { data: variantPriceSetLinks } = await query.graph({
      entity: "product_variant_price_set",
      fields: ["variant_id", "price_set_id"],
      filters: { price_set_id: uniquePriceSetIds },
    })

    const variantIdSet = new Set<string>()
    const priceSetByVariantId = new Map<string, string>()
    for (const link of variantPriceSetLinks || []) {
      if (link.variant_id && link.price_set_id) {
        variantIdSet.add(link.variant_id)
        priceSetByVariantId.set(link.variant_id, link.price_set_id)
      }
    }

    const variantIds = Array.from(variantIdSet)
    if (variantIds.length === 0) {
      return res.status(200).json({
        products: [],
        count: 0,
        fallback_active: true,
        price_list: {
          id: priceList.id,
          title: priceList.title,
          type: priceList.type,
          status: priceList.status,
          override_count: prices.length,
          price_set_count: uniquePriceSetIds.length,
        },
        company: {
          id: company.id,
          company_name: company.company_name,
          status: company.status,
        },
      })
    }

    // ── 6. Fetch variants with product data via Remote Query ──────────────
    const { data: variants } = await query.graph({
      entity: "variant",
      fields: [
        "id",
        "title",
        "sku",
        "barcode",
        "manage_inventory",
        "allow_backorder",
        "weight",
        "length",
        "height",
        "width",
        "origin_country",
        "mid_code",
        "material",
        "metadata",
        "product.id",
        "product.title",
        "product.handle",
        "product.thumbnail",
        "product.description",
        "product.subtitle",
        "product.status",
        "product.tags.id",
        "product.tags.value",
        "product.type.id",
        "product.type.value",
        "product.collection.id",
        "product.collection.title",
        "product.collection.handle",
        "product.categories.id",
        "product.categories.name",
        "product.categories.handle",
        "product.categories.parent_category_id",
        "product.metadata",
      ],
      filters: { id: variantIds },
    })

    if (!variants || variants.length === 0) {
      return res.status(200).json({
        products: [],
        count: 0,
        fallback_active: true,
        price_list: {
          id: priceList.id,
          title: priceList.title,
          type: priceList.type,
          status: priceList.status,
          override_count: prices.length,
          price_set_count: uniquePriceSetIds.length,
          variant_count: variantIds.length,
        },
        company: {
          id: company.id,
          company_name: company.company_name,
          status: company.status,
        },
      })
    }

    // ── 7. Build price lookup map (B2B ONLY) ────────────────────────────
    // Key: price_set_id → best price amount
    // Only B2B price list prices are included. No B2C retail pricing is
    // calculated or merged into this map, enforcing 100% backend structural
    // data isolation between B2B and B2C catalog channels.
    const priceBySetId = new Map<string, { amount: number; currency_code: string }>()
    for (const p of prices) {
      if (!p.price_set_id) continue
      const existing = priceBySetId.get(p.price_set_id)
      if (!existing || (p.currency_code === currencyCode && existing.currency_code !== currencyCode)) {
        priceBySetId.set(p.price_set_id, {
          amount: p.amount,
          currency_code: p.currency_code || currencyCode,
        })
      }
    }

    // ── 8. Group variants by product (B2B ONLY) ──────────────────────────
    // Products are grouped exclusively from variants that have a price_set_id
    // linked to the "B2B customer" price list. B2C-only variants are skipped.
    const productMap = new Map<
      string,
      {
        product: any
        matchedVariants: any[]
      }
    >()

    for (const v of variants || []) {
      const prod = v.product
      if (!prod || prod.status !== "published") continue

      const priceSetId = priceSetByVariantId.get(v.id)
      const priceInfo = priceSetId ? priceBySetId.get(priceSetId) : null

      // Only include variants that have a B2B price override linked
      // through the "B2B customer" price list. Variants without a B2B
      // price are excluded entirely from the B2B product catalog.
      if (!priceInfo) continue

      const variantEntry = {
        id: v.id,
        title: v.title,
        sku: v.sku,
        barcode: v.barcode,
        manage_inventory: v.manage_inventory,
        allow_backorder: v.allow_backorder,
        weight: v.weight,
        length: v.length,
        height: v.height,
        width: v.width,
        origin_country: v.origin_country,
        mid_code: v.mid_code,
        material: v.material,
        metadata: v.metadata,
        b2b_price: priceInfo.amount,
        b2b_currency_code: priceInfo.currency_code ?? currencyCode,
        is_b2b_override: true,
      }

      const existing = productMap.get(prod.id)
      if (existing) {
        existing.matchedVariants.push(variantEntry)
      } else {
        productMap.set(prod.id, {
          product: prod,
          matchedVariants: [variantEntry],
        })
      }
    }

    // ── 9. Build clean B2B product response array ─────────────────────────
    const normalizedB2BItemsArray: any[] = []

    for (const [, entry] of productMap) {
      const prod = entry.product
      const safeVariants = entry.matchedVariants.sort((a, b) =>
        (a.title || "").localeCompare(b.title || ""),
      )

      const categories = asArray(prod.categories).map((c: any) => ({
        id: c.id,
        name: c.name,
        handle: c.handle,
        parent_category_id: c.parent_category_id ?? null,
      }))

      const tags = asArray(prod.tags).map((t: any) => ({
        id: t.id,
        value: t.value,
      }))

      const collection = prod.collection
        ? {
            id: prod.collection.id,
            title: prod.collection.title,
            handle: prod.collection.handle ?? null,
          }
        : null

      const productType = prod.type
        ? {
            id: prod.type.id,
            value: prod.type.value,
          }
        : null

      normalizedB2BItemsArray.push({
        id: prod.id,
        title: prod.title,
        handle: prod.handle,
        thumbnail: prod.thumbnail,
        description: prod.description,
        subtitle: prod.subtitle ?? null,
        status: prod.status,
        categories,
        tags,
        collection,
        type: productType,
        metadata: prod.metadata ?? {},
        variants: safeVariants,
      })
    }

    // ── 10. Paginate ────────────────────────────────────────────────────
    const totalCount = normalizedB2BItemsArray.length
    const paginated = normalizedB2BItemsArray.slice(offset, offset + limit)

    return res.status(200).json({
      // B2B-ONLY RESPONSE KEY: populated exclusively from the B2B price list
      // override chain. No retail B2C catalog calculations pollute this channel.
      products: paginated,
      count: totalCount,
      price_list: {
        id: priceList.id,
        title: priceList.title,
        type: priceList.type,
        status: priceList.status,
        override_count: prices.length,
        resolved_products_count: totalCount,
      },
      company: {
        id: company.id,
        company_name: company.company_name,
        status: company.status,
      },
    })
  } catch (error: any) {
    console.error("[B2B Products Remote Query] Error:", error)
    if (error instanceof MedusaError) {
      return res
        .status(error.type === "not_found" ? 404 : 400)
        .json({ message: error.message })
    }
    return res
      .status(500)
      .json({ message: error.message || "Failed to load B2B products" })
  }
}