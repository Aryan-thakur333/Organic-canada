import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { BUNDLE_MODULE } from "../../../modules/bundle"
import { validateFixedBundleComponents } from "../../../modules/bundle/utils/configuration"

const handlePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Validate a major-unit price amount.
 * Accepts values like 21.99, 29.99, 100, etc.
 * Rejects: negative, zero, NaN, infinite, more than 2 decimal places.
 */
function validateMajorUnitAmount(amount: any): boolean {
  const num = Number(amount)
  if (!Number.isFinite(num) || num <= 0) return false
  // Ensure at most 2 decimal places
  const rounded = Math.round(num * 100) / 100
  return Math.abs(rounded - num) < 0.001
}

async function validateComponents(req: MedusaRequest, components: any[], salesChannelIds: string[]) {
  validateFixedBundleComponents(components)
  const ids = components.map((component) => component.variant_id)
  const query: any = req.scope.resolve("query")
  const { data: variants } = await query.graph({ entity: "variant", fields: ["id", "product.id", "product.status", "product.metadata", "product.sales_channels.id"], filters: { id: ids }, pagination: { take: 100 } })
  if (variants.length !== ids.length) throw new Error("One or more component variants do not exist")
  for (const variant of variants) {
    if (variant.product?.status !== "published") throw new Error(`Component ${variant.id} is not published`)
    if (variant.product?.metadata?.product_type === "bundle") throw new Error("Nested bundles are not supported")
    if (variant.product?.metadata?.product_type === "personalized") throw new Error("Personalized bundle components are not supported in the first release")
    if (salesChannelIds.some((id) => !variant.product?.sales_channels?.some((channel: any) => channel.id === id))) throw new Error(`Component ${variant.id} is missing a required sales channel`)
  }
  return new Map(variants.map((variant: any) => [variant.id, variant]))
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(BUNDLE_MODULE)
  const [bundles, count] = await service.listAndCountBundleDefinitions({}, { order: { created_at: "DESC" }, skip: Number(req.query.offset || 0), take: Math.min(Number(req.query.limit || 50), 200) })
  const items = await service.listBundleItems({ bundle_id: bundles.map((bundle: any) => bundle.id) }, { order: { sort_order: "ASC" } })
  return res.status(200).json({ bundles: bundles.map((bundle: any) => ({ ...bundle, items: items.filter((item: any) => item.bundle_id === bundle.id) })), count })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = req.body as any
    const { title, description, handle, components } = body
    if (!title || !handlePattern.test(String(handle || ""))) return res.status(400).json({ message: "title and a lowercase kebab-case handle are required" })
    const salesChannelIds = [...new Set((body.sales_channel_ids || []).map(String))] as string[]
    const regionIds = [...new Set((body.region_ids || []).map(String))] as string[]
    const prices = body.prices || []
    if (!salesChannelIds.length || !regionIds.length || !body.shipping_profile_id) return res.status(400).json({ message: "sales_channel_ids, region_ids, and shipping_profile_id are required" })

    // Validate prices as major-unit decimal amounts (e.g. 21.99, not 2199)
    if (!Array.isArray(prices) || prices.length === 0) {
      throw new Error("At least one regional price is required")
    }
    for (const price of prices) {
      if (!price.currency_code) throw new Error("Each price must have a currency_code")
      if (!validateMajorUnitAmount(price.amount)) {
        throw new Error(`Price amount ${price.amount} for ${price.currency_code} is invalid. Use major-unit decimals like 21.99, not 2199.`)
      }
    }

    const regionService: any = req.scope.resolve(Modules.REGION)
    const regions = await regionService.listRegions({ id: regionIds })
    if (regions.length !== regionIds.length) throw new Error("One or more regions do not exist")
    const requiredCurrencies = new Set<string>(regions.map((region: any) => String(region.currency_code).toLowerCase()))
    for (const currency of requiredCurrencies) {
      if (!prices.some((price: any) => String(price.currency_code).toLowerCase() === currency)) {
        throw new Error(`Missing fixed bundle price for ${currency.toUpperCase()}`)
      }
    }
    const variants = await validateComponents(req, components, salesChannelIds)

    // Prices are already in major units — pass directly to Medusa (which stores them as-is)
    const medusaPrices = prices.map((price: any) => ({
      amount: Number(Number(price.amount).toFixed(2)),
      currency_code: String(price.currency_code).toLowerCase(),
    }))

    const { result: products } = await createProductsWorkflow(req.scope).run({ input: { products: [{
      title, description: description || "", handle, status: body.status === "draft" ? ProductStatus.DRAFT : ProductStatus.PUBLISHED,
      shipping_profile_id: body.shipping_profile_id, sales_channels: salesChannelIds.map((id) => ({ id })),
      metadata: { ...(body.metadata || {}), product_type: "bundle", bundle_type: "fixed_bundle" },
      options: [{ title: "Bundle", values: ["Fixed"] }],
      variants: [{ title: "Fixed Bundle", sku: body.sku || `BUNDLE-${String(handle).toUpperCase()}`, manage_inventory: false, allow_backorder: true,
        options: { Bundle: "Fixed" }, prices: medusaPrices }],
    }] } })
    const query: any = req.scope.resolve("query")
    const { data: created } = await query.graph({ entity: "product", fields: ["id", "title", "handle", "variants.id"], filters: { id: products[0].id } })
    const product = created[0]
    const service: any = req.scope.resolve(BUNDLE_MODULE)
    const bundle = await service.createBundleDefinitions({
      title, handle, status: body.status === "draft" ? "draft" : "active", bundle_type: "fixed_bundle", pricing_strategy: "fixed_price", inventory_strategy: "components",
      product_id: product.id, variant_id: product.variants[0].id, sales_channel_ids: salesChannelIds, metadata: body.metadata || null,
    })
    const bundleItems = await service.createBundleItems(components.map((component: any, index: number) => {
      const child: any = variants.get(component.variant_id)
      return { bundle_id: bundle.id, variant_id: component.variant_id, parent_product_id: product.id, child_product_id: child.product.id,
        quantity: component.quantity, sort_order: component.sort_order ?? index, optional: false, is_fulfillment_hidden: false, metadata: component.metadata || null }
    }))
    const eventBus: any = req.scope.resolve(Modules.EVENT_BUS)
    await eventBus.emit({ name: "bundle.created", data: { id: bundle.id, product_id: product.id, actor_id: (req as any).auth_context?.actor_id } })
    return res.status(201).json({ bundle: { ...bundle, items: bundleItems, product } })
  } catch (error: any) {
    return res.status(422).json({ code: "BUNDLE_CONFIGURATION_INVALID", message: error.message || "Bundle creation failed" })
  }
}
