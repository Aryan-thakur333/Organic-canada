import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaRequest } from "@medusajs/framework/http"
import { linkProductsToSalesChannelWorkflow } from "@medusajs/core-flows"
import { POS_MODULE } from "../../modules/pos"
import { PosError, type PosRecord, type PosService } from "./contracts"

export type PosAvailabilityChannelKey = "canada" | "usa"

type ProductAvailabilityProduct = {
  id: string
  title?: string
  status?: string
  deleted_at?: string | null
  metadata?: Record<string, unknown>
  sales_channels?: Array<{ id: string; name?: string }>
  variants?: Array<{ id: string; title?: string; sku?: string; deleted_at?: string | null }>
}

const POS_CHANNEL_KEYS: PosAvailabilityChannelKey[] = ["canada", "usa"]

export function posAutoAssignPolicy(env: NodeJS.ProcessEnv = process.env) {
  return {
    canada: String(env.POS_AUTO_ASSIGN_CANADA_CHANNEL || "false").trim().toLowerCase() === "true",
    usa: String(env.POS_AUTO_ASSIGN_USA_CHANNEL || "false").trim().toLowerCase() === "true",
  }
}

function lower(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function isActiveRegister(register: PosRecord) {
  return lower(register.status || "ACTIVE") === "active"
}

function registerChannelKey(register: PosRecord): PosAvailabilityChannelKey | null {
  const fingerprint = `${lower(register.name)} ${lower(register.code)} ${lower(register.currency_code)}`
  if (fingerprint.includes("canada") || fingerprint.includes("ca-pos") || lower(register.currency_code) === "cad") return "canada"
  if (fingerprint.includes("usa") || fingerprint.includes("us-pos") || fingerprint.includes("united states") || lower(register.currency_code) === "usd") return "usa"
  return null
}

function channelLabel(key: PosAvailabilityChannelKey) {
  return key === "canada" ? "Canada POS" : "USA POS"
}

export function productSalesChannelIds(product: ProductAvailabilityProduct) {
  return (product.sales_channels || []).map((channel) => channel.id).filter(Boolean).sort()
}

export function isPosSellableProduct(product: ProductAvailabilityProduct) {
  const type = lower(product.metadata?.product_type || "standard")
  if (product.deleted_at) return { sellable: false, reason: "deleted" }
  if (lower(product.status) !== "published") return { sellable: false, reason: "not_published" }
  if (type === "personalized" || type === "bundle") return { sellable: false, reason: `unsupported_${type}` }
  if (product.metadata?.subscription_only === true || product.metadata?.is_subscription === true) return { sellable: false, reason: "subscription_only" }
  if (!(product.variants || []).some((variant) => !variant.deleted_at)) return { sellable: false, reason: "no_active_variants" }
  return { sellable: true, reason: "" }
}

export async function loadPosAvailabilityRegisters(req: MedusaRequest) {
  const service = req.scope.resolve(POS_MODULE) as PosService
  const registers = (await service.listPosRegisters({}, { take: 100 })) as PosRecord[]
  const byKey = new Map<PosAvailabilityChannelKey, PosRecord>()
  for (const register of registers.filter(isActiveRegister)) {
    const key = registerChannelKey(register)
    if (key && !byKey.has(key) && String(register.sales_channel_id || "").trim()) byKey.set(key, register)
  }
  return POS_CHANNEL_KEYS.map((key) => {
    const register = byKey.get(key)
    return {
      key,
      label: channelLabel(key),
      register_id: register?.id || "",
      register_name: String(register?.name || channelLabel(key)),
      sales_channel_id: String(register?.sales_channel_id || ""),
      stock_location_id: String(register?.stock_location_id || ""),
      currency_code: lower(register?.currency_code || (key === "canada" ? "cad" : "usd")),
      register_found: Boolean(register),
    }
  })
}

export async function loadProductForPosAvailability(req: MedusaRequest, productId: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: ProductAvailabilityProduct[] }> }
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "deleted_at", "metadata", "sales_channels.id", "sales_channels.name", "variants.id", "variants.title", "variants.sku", "variants.deleted_at"],
    filters: { id: productId },
    pagination: { take: 1 },
  })
  const product = data?.[0]
  if (!product) throw new PosError("POS_PRODUCT_NOT_FOUND", "Product not found", 404)
  return product
}

export async function loadProductsForBulkPosAvailability(req: MedusaRequest) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: ProductAvailabilityProduct[] }> }
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "deleted_at", "metadata", "sales_channels.id", "sales_channels.name", "variants.id", "variants.deleted_at"],
    pagination: { take: 10000 },
  })
  return data || []
}

export function productAvailabilityPayload(product: ProductAvailabilityProduct, channels: Awaited<ReturnType<typeof loadPosAvailabilityRegisters>>) {
  const linked = new Set(productSalesChannelIds(product))
  return {
    product: {
      id: product.id,
      title: product.title || "",
      status: product.status || "",
      sales_channels: product.sales_channels || [],
      variants: product.variants || [],
    },
    pos_channels: channels.map((channel) => ({
      ...channel,
      available: Boolean(channel.sales_channel_id && linked.has(channel.sales_channel_id)),
    })),
    auto_assign_policy: posAutoAssignPolicy(),
  }
}

export async function addProductToPosSalesChannel(req: MedusaRequest, productId: string, key: PosAvailabilityChannelKey) {
  const product = await loadProductForPosAvailability(req, productId)
  const channels = await loadPosAvailabilityRegisters(req)
  const target = channels.find((channel) => channel.key === key)
  if (!target?.sales_channel_id) throw new PosError("POS_SALES_CHANNEL_NOT_CONFIGURED", `${channelLabel(key)} sales channel is not configured`, 422)
  const before = productSalesChannelIds(product)
  if (!before.includes(target.sales_channel_id)) {
    await linkProductsToSalesChannelWorkflow(req.scope).run({ input: { id: target.sales_channel_id, add: [product.id] } })
  }
  const refreshed = await loadProductForPosAvailability(req, productId)
  const after = productSalesChannelIds(refreshed)
  return {
    product_id: product.id,
    channel: target,
    official_product_channel_link_used: true,
    linked: !before.includes(target.sales_channel_id) && after.includes(target.sales_channel_id),
    already_linked: before.includes(target.sales_channel_id),
    sales_channel_ids_before: before,
    sales_channel_ids_after: after,
    preserved_existing_channels: before.every((id) => after.includes(id)),
    availability: productAvailabilityPayload(refreshed, channels),
  }
}

export async function removeProductFromPosSalesChannel(req: MedusaRequest, productId: string, key: PosAvailabilityChannelKey) {
  const product = await loadProductForPosAvailability(req, productId)
  const channels = await loadPosAvailabilityRegisters(req)
  const target = channels.find((channel) => channel.key === key)
  if (!target?.sales_channel_id) throw new PosError("POS_SALES_CHANNEL_NOT_CONFIGURED", `${channelLabel(key)} sales channel is not configured`, 422)
  const before = productSalesChannelIds(product)
  if (before.includes(target.sales_channel_id)) {
    await linkProductsToSalesChannelWorkflow(req.scope).run({ input: { id: target.sales_channel_id, remove: [product.id] } })
  }
  const refreshed = await loadProductForPosAvailability(req, productId)
  const after = productSalesChannelIds(refreshed)
  const beforeOtherChannels = before.filter((id) => id !== target.sales_channel_id)
  return {
    product_id: product.id,
    channel: target,
    official_product_channel_link_used: true,
    removed: before.includes(target.sales_channel_id) && !after.includes(target.sales_channel_id),
    already_removed: !before.includes(target.sales_channel_id),
    sales_channel_ids_before: before,
    sales_channel_ids_after: after,
    preserved_existing_channels: beforeOtherChannels.every((id) => after.includes(id)),
    availability: productAvailabilityPayload(refreshed, channels),
  }
}

export async function addAllSellableProductsToPosSalesChannel(req: MedusaRequest, key: PosAvailabilityChannelKey) {
  const channels = await loadPosAvailabilityRegisters(req)
  const target = channels.find((channel) => channel.key === key)
  if (!target?.sales_channel_id) throw new PosError("POS_SALES_CHANNEL_NOT_CONFIGURED", `${channelLabel(key)} sales channel is not configured`, 422)
  const products = await loadProductsForBulkPosAvailability(req)
  const toAdd: string[] = []
  const skipped: Array<{ product_id: string; reason: string }> = []
  let alreadyLinked = 0
  for (const product of products) {
    const policy = isPosSellableProduct(product)
    if (!policy.sellable) {
      skipped.push({ product_id: product.id, reason: policy.reason })
      continue
    }
    const linked = productSalesChannelIds(product).includes(target.sales_channel_id)
    if (linked) {
      alreadyLinked += 1
    } else {
      toAdd.push(product.id)
    }
  }
  const errors: Array<{ product_id: string; message: string }> = []
  const chunks = Array.from({ length: Math.ceil(toAdd.length / 100) }, (_, index) => toAdd.slice(index * 100, index * 100 + 100))
  let linked = 0
  for (const chunk of chunks) {
    try {
      await linkProductsToSalesChannelWorkflow(req.scope).run({ input: { id: target.sales_channel_id, add: chunk } })
      linked += chunk.length
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to link products"
      for (const product_id of chunk) errors.push({ product_id, message })
    }
  }
  return {
    channel: target,
    productsRead: products.length,
    linked,
    alreadyLinked,
    skipped,
    errors,
    official_product_channel_link_used: true,
  }
}
