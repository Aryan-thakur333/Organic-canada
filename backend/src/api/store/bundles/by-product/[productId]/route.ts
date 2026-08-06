import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../../../../../modules/bundle"
import { loadBundleOperationalContext } from "../../../../../modules/bundle/utils/availability"

const PROD_ID_RE = /^prod_[A-Za-z0-9]+$/

/**
 * GET /store/bundles/by-product/:productId
 *
 * Resolves the BundleDefinition linked to the given Medusa product ID.
 *
 * Query params (required for availability):
 *   region_id       — current storefront region
 *   country_code    — ISO 3166-1 alpha-2 country code
 *   sales_channel_id — (optional) explicit sales channel; falls back to publishable key context
 *
 * Responses:
 *   200 — bundle found, full detail
 *   400 — invalid productId format or missing required context
 *   404 — no active bundle linked to this product
 *   422 — genuine bundle configuration error (invalid components, etc.)
 *   500 — internal query/link failure
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { productId } = req.params

  // 1. Validate productId format
  if (!productId || !PROD_ID_RE.test(productId)) {
    return res.status(400).json({
      code: "BUNDLE_REGION_CONTEXT_REQUIRED",
      message: "productId must be a valid Medusa product ID (prod_...)",
    })
  }

  // 2. Extract region context from query params
  const regionId = String(req.query.region_id || "").trim()
  const countryCode = String(req.query.country_code || "").trim()
  let salesChannelId = String(req.query.sales_channel_id || "").trim()

  // Fall back to publishable key context for sales channel
  if (!salesChannelId) {
    salesChannelId = (req as any).publishable_key_context?.sales_channel_ids?.[0] || ""
  }

  // region_id and country_code are required for availability calculation
  if (!regionId || !countryCode) {
    return res.status(400).json({
      code: "BUNDLE_REGION_CONTEXT_REQUIRED",
      message: "region_id and country_code query parameters are required",
    })
  }

  try {
    // 3. Load BundleDefinition by product_id (direct field on model)
    const bundleService: any = req.scope.resolve(BUNDLE_MODULE)
    const bundles = await bundleService.listBundleDefinitions({ product_id: productId })

    // 4. Find active bundle
    const bundle = bundles.find((b: any) => b.status === "active")
    if (!bundle) {
      return res.status(404).json({
        code: "BUNDLE_NOT_FOUND",
        message: "No active bundle is linked to this product",
      })
    }

    // 5. Validate sales channel
    if (!salesChannelId) {
      return res.status(400).json({
        code: "BUNDLE_REGION_CONTEXT_REQUIRED",
        message: "No storefront sales channel could be determined. Provide sales_channel_id query param.",
      })
    }

    // 6. Resolve regional price from Medusa pricing using QueryContext (same pattern as personalization)
    const query: any = req.scope.resolve("query")
    let bundlePrice: number | null = null
    let bundleCurrency: string | null = null

    try {
      const regionService: any = req.scope.resolve(Modules.REGION)
      const region = await regionService.retrieveRegion(regionId)
      const regionCurrency = String(region?.currency_code || "").toLowerCase()

      const { QueryContext } = await import("@medusajs/framework/utils")
      const { data: variants } = await query.graph({
        entity: "variant",
        fields: ["id", "calculated_price.*", "prices.amount", "prices.currency_code"],
        filters: { id: bundle.variant_id },
        context: { calculated_price: QueryContext({ region_id: regionId, currency_code: regionCurrency }) },
        pagination: { take: 1 },
      })
      const variant = variants[0]
      if (variant?.calculated_price?.calculated_amount !== undefined && variant.calculated_price?.calculated_amount !== null) {
        bundlePrice = Number(variant.calculated_price.calculated_amount)
        bundleCurrency = String(variant.calculated_price.currency_code || "").toLowerCase()
      } else if (variant?.prices?.length) {
        const matchingPrice = (variant.prices || []).find(
          (p: any) => String(p.currency_code || "").toLowerCase() === regionCurrency
        )
        if (matchingPrice) {
          bundlePrice = Number(matchingPrice.amount)
          bundleCurrency = regionCurrency
        }
      }
    } catch {
      // Price resolution failure is non-fatal for the structure response
    }

    // 7. Load operational context (components + availability)
    let operational: any
    try {
      operational = await loadBundleOperationalContext(req.scope, bundle, 1, {
        sales_channel_id: salesChannelId,
        country_code: countryCode,
      })
    } catch (opError: any) {
      // Distinguish configuration errors from internal errors
      const msg = String(opError?.message || "")
      const isConfigError =
        msg.includes("no components") ||
        msg.includes("duplicate component") ||
        msg.includes("not published") ||
        msg.includes("not available in this sales channel") ||
        msg.includes("no longer exist")
      if (isConfigError) {
        return res.status(422).json({
          code: "BUNDLE_CONFIGURATION_INVALID",
          message: msg,
        })
      }
      // No eligible location is an expected scenario (product page still renders)
      if (msg.includes("No eligible regional stock location")) {
        return res.status(200).json({
          bundle: {
            id: bundle.id,
            type: bundle.bundle_type || "FIXED_BUNDLE",
            status: bundle.status,
            product_id: bundle.product_id,
            variant_id: bundle.variant_id,
            title: bundle.title,
            handle: bundle.handle,
            price: bundlePrice,
            currency_code: bundleCurrency,
            components: [],
            availability: { available_quantity: 0, stock_location_id: null },
          },
        })
      }
      // Internal error — do NOT return 422
      throw opError
    }

    // 8. Build stable response
    const selectedLocation = operational.selected_location
    return res.status(200).json({
      bundle: {
        id: bundle.id,
        type: bundle.bundle_type || "FIXED_BUNDLE",
        status: bundle.status,
        product_id: bundle.product_id,
        variant_id: bundle.variant_id,
        title: bundle.title,
        handle: bundle.handle,
        price: bundlePrice,
        currency_code: bundleCurrency,
        components: operational.components.map((component: any) => ({
          variant_id: component.id,
          title: component.title || "",
          sku: component.sku || "",
          quantity: component.quantity,
          product: {
            id: component.product?.id || "",
            title: component.product?.title || "",
            thumbnail: component.product?.thumbnail || null,
          },
          available_quantity: selectedLocation
            ? Math.floor(
                (selectedLocation.available_quantity || 0) * component.quantity
              )
            : 0,
        })),
        availability: {
          available_quantity: operational.available_quantity || 0,
          stock_location_id: selectedLocation?.location_id || null,
        },
      },
    })
  } catch (error: any) {
    // All unhandled internal errors → 500, not 422
    console.error("[bundle/by-product] Internal error:", error?.message || error)
    return res.status(500).json({
      code: "BUNDLE_QUERY_FAILED",
      message: "An internal error occurred while loading the bundle",
    })
  }
}
