import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../../../../modules/bundle"
import { loadBundleOperationalContext } from "../../../../modules/bundle/utils/availability"

// Configuration errors that should return 422
const CONFIG_ERROR_PATTERNS = [
  "no components",
  "duplicate component",
  "not published",
  "not available in this sales channel",
  "no longer exist",
  "bundle has no component",
]

function isConfigurationError(message: string): boolean {
  const lower = message.toLowerCase()
  return CONFIG_ERROR_PATTERNS.some((pattern) => lower.includes(pattern))
}

async function getActiveBundle(service: any, productId: string) {
  const bundles = await service.listBundleDefinitions({ product_id: productId, status: "active" })
  if (!bundles[0]) throw Object.assign(new Error("Active bundle not found"), { code: "BUNDLE_NOT_FOUND" })
  return bundles[0]
}

/**
 * GET /store/bundles/:parent_product_id
 *
 * Legacy endpoint — requires region_id and country_code query params.
 * Prefer GET /store/bundles/by-product/:productId for new integrations.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const regionId = String(req.query.region_id || "")
  let salesChannelId = String(req.query.sales_channel_id || "")
  const countryCode = String(req.query.country_code || "")

  if (!regionId || !countryCode) {
    return res.status(400).json({
      code: "BUNDLE_REGION_CONTEXT_REQUIRED",
      message: "region_id and country_code are required",
    })
  }

  try {
    const service: any = req.scope.resolve(BUNDLE_MODULE)
    const bundle = await getActiveBundle(service, req.params.parent_product_id)

    if (!salesChannelId) {
      salesChannelId = (req as any).publishable_key_context?.sales_channel_ids?.[0] || bundle.sales_channel_ids?.[0] || ""
    }
    if (!salesChannelId) {
      return res.status(400).json({
        code: "BUNDLE_REGION_CONTEXT_REQUIRED",
        message: "No storefront sales channel is available",
      })
    }

    // Retrieve regional price via Medusa query graph
    const query: any = req.scope.resolve("query")
    let bundlePrice: number | null = null
    let bundleCurrency: string | null = null

    try {
      const { data: variants } = await query.graph({
        entity: "variant",
        fields: ["id", "calculated_price.calculated_amount", "calculated_price.currency_code", "prices.amount", "prices.currency_code"],
        filters: { id: bundle.variant_id },
        context: { region_id: regionId },
        pagination: { take: 1 },
      })
      const variant = variants[0]
      if (variant?.calculated_price?.calculated_amount !== undefined && variant.calculated_price.calculated_amount !== null) {
        bundlePrice = Number(variant.calculated_price.calculated_amount)
        bundleCurrency = String(variant.calculated_price.currency_code || "").toLowerCase()
      } else if (variant?.prices?.length) {
        const regionService: any = req.scope.resolve(Modules.REGION)
        const region = await regionService.retrieveRegion(regionId)
        const regionCurrency = String(region?.currency_code || "").toLowerCase()
        const match = (variant.prices || []).find((p: any) => String(p.currency_code || "").toLowerCase() === regionCurrency)
        if (match) { bundlePrice = Number(match.amount); bundleCurrency = regionCurrency }
      }
    } catch { /* non-fatal */ }

    const operational = await loadBundleOperationalContext(req.scope, bundle, 1, {
      sales_channel_id: salesChannelId,
      country_code: countryCode,
    })

    return res.status(200).json({
      bundle: {
        id: bundle.id,
        title: bundle.title,
        handle: bundle.handle,
        product_id: bundle.product_id,
        variant_id: bundle.variant_id,
        bundle_type: bundle.bundle_type,
        pricing_strategy: bundle.pricing_strategy,
        currency_code: bundleCurrency,
        price: bundlePrice,
        available_quantity: operational.available_quantity,
        location_availability: operational.location_availability.map((location: any) => ({
          location_id: location.location_id,
          available_quantity: location.available_quantity,
        })),
        components: operational.components.map((component: any) => ({
          variant_id: component.id,
          title: component.title,
          sku: component.sku,
          quantity: component.quantity,
          product: { id: component.product.id, title: component.product.title, thumbnail: component.product.thumbnail },
        })),
      },
    })
  } catch (error: any) {
    if (error?.code === "BUNDLE_NOT_FOUND") {
      return res.status(404).json({ code: "BUNDLE_NOT_FOUND", message: error.message })
    }
    const msg = String(error?.message || "")
    if (isConfigurationError(msg)) {
      return res.status(422).json({ code: "BUNDLE_CONFIGURATION_INVALID", message: msg })
    }
    // Internal/unexpected errors → 500
    console.error("[bundle/parent_product_id] Internal error:", msg)
    return res.status(500).json({ code: "BUNDLE_QUERY_FAILED", message: "An internal error occurred" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return res.status(410).json({
    code: "ENDPOINT_MOVED",
    message: "Use POST /store/carts/:cartId/bundled-line-items instead",
  })
}
