import { DIGITAL_ASSET_MODULE } from "../modules/digital-asset/index"
import { Modules } from "@medusajs/framework/utils"

type DigitalAsset = {
  id?: string | null
  file_name?: string | null
  mime_type?: string | null
  file_size?: number | null
  version?: string | null
  secure_s3_key?: string | null
}

type DownloadAssetShape = {
  id?: string | null
  digital_asset_id?: string | null
  storage_key?: string | null
  secure_s3_key?: string | null
  digital_asset_key?: string | null
  filename?: string | null
  file_name?: string | null
  mime_type?: string | null
  file_size?: number | null
  version?: string | null
}

type ProductShape = {
  id?: string | null
  metadata?: Record<string, any> | null
  digital_asset?: DigitalAsset | DigitalAsset[] | null
}

type VariantProductShape = {
  id?: string | null
  metadata?: Record<string, any> | null
  digital_asset?: DigitalAsset | DigitalAsset[] | null
}

type VariantShape = {
  id?: string | null
  sku?: string | null
  metadata?: Record<string, any> | null
  product_id?: string | null
  product?: VariantProductShape | null
}

type LineItem = {
  id: string
  product_id: string
  variant_id?: string | null
  title?: string | null
  metadata?: Record<string, any> | null
  variant?: VariantShape | null
}

type Order = {
  id: string
  customer_id?: string | null
  status?: string | null
  payment_status?: string | null
  created_at?: string | Date | null
  items?: LineItem[] | null
  payment_collections?: Array<{
    id?: string | null
    payments?: Array<{
      id?: string | null
      amount?: number | null
      captured_at?: string | Date | null
      provider_id?: string | null
      payment_session?: {
        data?: Record<string, any> | null
      } | null
    }> | null
  }> | null
}

type BackfillContext = {
  container: any
}

type BackfillReport = {
  scanned: number
  digitalOrdersFound: number
  recordsCreated: number
  recordsUpdated: number
  recordsSkipped: number
  errors: number
}

const PAID_PAYMENT_STATUSES = new Set([
  "captured",
  "paid",
  "partially_refunded",
])

function normalizeScalar(value: unknown): string {
  if (Array.isArray(value)) return normalizeScalar(value[0])
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function normalizeFlag(value: unknown): string {
  return normalizeScalar(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
}

function hasDownloadAssets(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function isPaidOrder(order: Order): boolean {
  const paymentStatus = normalizeFlag(order.payment_status)
  const orderStatus = normalizeFlag(order.status)

  if (PAID_PAYMENT_STATUSES.has(paymentStatus)) return true
  if (paymentStatus.includes("captured")) return true
  if (paymentStatus.includes("paid")) return true
  if (paymentStatus.includes("partially_refunded")) return true
  if (orderStatus === "completed") return true
  if (orderStatus === "paid") return true

  for (const collection of Array.isArray(order.payment_collections) ? order.payment_collections : []) {
    for (const payment of Array.isArray(collection?.payments) ? collection.payments : []) {
      const sessionData = payment?.payment_session?.data || {}
      const sessionStatus = normalizeFlag(sessionData.status)
      const amountReceived = Number(sessionData.amount_received || 0)
      const capturedAt = normalizeScalar(payment?.captured_at)
      const paymentAmount = Number((payment as any)?.amount || 0)
      const paymentStatusStr = normalizeFlag((payment as any)?.status)

      if (capturedAt) return true
      if (sessionStatus === "succeeded") return true
      if (paymentStatusStr === "captured" || paymentStatusStr === "succeeded" || paymentStatusStr === "paid") return true
      if (amountReceived > 0) return true
      if (paymentAmount > 0 && normalizeFlag(payment?.provider_id).includes("system_default")) {
        return true
      }
    }
  }

  return false
}

function isDigitalItem(item: LineItem): boolean {
  const itemMeta = item.metadata || {}
  const variantMeta = item.variant?.metadata || {}
  const productMeta = item.variant?.product?.metadata || {}
  const sku = normalizeScalar(item.variant?.sku).toLowerCase()

  return (
    itemMeta.is_digital === true ||
    itemMeta.is_digital === "true" ||
    hasDownloadAssets(itemMeta.download_assets) ||

    variantMeta.is_digital === true ||
    variantMeta.is_digital === "true" ||
    hasDownloadAssets(variantMeta.download_assets) ||

    productMeta.is_digital === true ||
    productMeta.is_digital === "true" ||
    hasDownloadAssets(productMeta.download_assets) ||
    Boolean(productMeta.digital_asset_key) ||

    sku.includes("digital") ||
    sku.includes("ebook") ||
    sku.includes("pdf")
  )
}

function getPrimaryLinkedAsset(product: ProductShape | null | undefined): DigitalAsset | null {
  const linked = product?.digital_asset
  if (Array.isArray(linked)) {
    return linked[0] || null
  }
  return linked || null
}

function getFirstDownloadAsset(value: unknown): DownloadAssetShape {
  const assets = Array.isArray(value) ? value : []
  const asset = (assets[0] || {}) as DownloadAssetShape

  return {
    id: asset.id || asset.digital_asset_id || null,
    digital_asset_id: asset.digital_asset_id || asset.id || null,
    storage_key: asset.storage_key || asset.secure_s3_key || asset.digital_asset_key || null,
    secure_s3_key: asset.secure_s3_key || asset.storage_key || null,
    digital_asset_key: asset.digital_asset_key || asset.id || asset.digital_asset_id || null,
    filename: asset.filename || asset.file_name || null,
    file_name: asset.file_name || asset.filename || null,
    mime_type: asset.mime_type || null,
    file_size: asset.file_size || 0,
    version: asset.version || null,
  }
}

function resolveEntitlementMetadata(item: LineItem) {
  const itemMeta = item.metadata || {}
  const variantMeta = item.variant?.metadata || {}
  const productMeta = item.variant?.product?.metadata || {}
  const linkedAsset = getPrimaryLinkedAsset(item.variant?.product)

  const itemAsset = getFirstDownloadAsset(itemMeta.download_assets)
  const variantAsset = getFirstDownloadAsset(variantMeta.download_assets)
  const productAsset = getFirstDownloadAsset(productMeta.download_assets)

  const digitalAssetId =
    linkedAsset?.id ||
    itemAsset.id ||
    variantAsset.id ||
    productAsset.id ||
    itemMeta.digital_asset_key ||
    variantMeta.digital_asset_key ||
    productMeta.digital_asset_key ||
    null

  const storageKey =
    linkedAsset?.secure_s3_key ||
    itemAsset.storage_key ||
    variantAsset.storage_key ||
    productAsset.storage_key ||
    productMeta.storage_key ||
    variantMeta.storage_key ||
    itemMeta.storage_key ||
    null

  const fileName =
    itemAsset.file_name ||
    variantAsset.file_name ||
    productAsset.file_name ||
    linkedAsset?.file_name ||
    productMeta.file_name ||
    variantMeta.file_name ||
    itemMeta.file_name ||
    item.title ||
    "download"

  const mimeType =
    itemAsset.mime_type ||
    variantAsset.mime_type ||
    productAsset.mime_type ||
    linkedAsset?.mime_type ||
    productMeta.mime_type ||
    variantMeta.mime_type ||
    itemMeta.mime_type ||
    "application/octet-stream"

  const fileSize =
    Number(itemAsset.file_size || 0) ||
    Number(variantAsset.file_size || 0) ||
    Number(productAsset.file_size || 0) ||
    Number(linkedAsset?.file_size || 0) ||
    Number(productMeta.file_size || 0) ||
    Number(variantMeta.file_size || 0) ||
    Number(itemMeta.file_size || 0) ||
    0

  const version =
    itemAsset.version ||
    variantAsset.version ||
    productAsset.version ||
    linkedAsset?.version ||
    productMeta.version ||
    variantMeta.version ||
    itemMeta.version ||
    "1.0.0"

  const downloadLimit = Math.max(0, Number(itemMeta.download_limit) || 5)
  const expiryDays = Math.max(1, Number(itemMeta.download_expiry_days) || 365)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiryDays)

  return {
    digitalAssetId,
    storageKey,
    fileName,
    mimeType,
    fileSize,
    version,
    downloadLimit,
    expiryDays,
    expiresAt,
    digitalAssetKey:
      itemMeta.digital_asset_key ||
      variantMeta.digital_asset_key ||
      productMeta.digital_asset_key ||
      null,
  }
}

async function fetchOrdersPage(query: any, skip: number, take: number): Promise<Order[]> {
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "customer_id",
      "customer.id",
      "status",
      "payment_status",
      "created_at",
      "items.*",
      "payment_collections.id",
      "payment_collections.payments.id",
      "payment_collections.payments.status",
      "payment_collections.payments.amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.payment_session.data",
    ],
    pagination: {
      skip,
      take,
      order: {
        created_at: "DESC",
      },
    },
  })

  return Array.isArray(data) ? (data as Order[]) : []
}

async function fetchProductAssetMap(digitalAssetService: any, productIds: string[]): Promise<Map<string, ProductShape>> {
  const uniqueProductIds = [...new Set(productIds.filter(Boolean))]
  if (!uniqueProductIds.length) {
    return new Map()
  }

  const map = new Map<string, ProductShape>()
  const assets = await digitalAssetService.listDigitalAssets(
    { product_id: uniqueProductIds },
    { take: uniqueProductIds.length * 20 }
  )

  for (const productId of uniqueProductIds) {
    map.set(productId, {
      id: productId,
      digital_asset: [],
    })
  }

  for (const asset of Array.isArray(assets) ? assets : []) {
    const productId = normalizeScalar((asset as any).product_id)
    if (!productId) {
      continue
    }

    const existing = map.get(productId) || { id: productId, digital_asset: [] }
    const currentAssets = Array.isArray(existing.digital_asset)
      ? existing.digital_asset
      : existing.digital_asset
        ? [existing.digital_asset]
        : []

    currentAssets.push(asset as DigitalAsset)
    map.set(productId, {
      ...existing,
      digital_asset: currentAssets,
    })
  }

  return map
}

async function fetchProductMap(productModuleService: any, productIds: string[]): Promise<Map<string, ProductShape>> {
  const uniqueProductIds = [...new Set(productIds.filter(Boolean))]
  if (!uniqueProductIds.length) {
    return new Map()
  }

  const products = await productModuleService.listProducts(
    { id: uniqueProductIds },
    { take: uniqueProductIds.length }
  )

  const map = new Map<string, ProductShape>()
  for (const product of Array.isArray(products) ? products : []) {
    map.set(String(product.id), product as ProductShape)
  }

  return map
}

export default async function ({ container }: BackfillContext) {
  if (!container) {
    throw new Error("Medusa exec did not provide a container")
  }

  console.log("=== Backfill Digital Download Entitlements ===\n")

  const query = container.resolve("query")
  const productModuleService = container.resolve(Modules.PRODUCT)
  const digitalAssetService = container.resolve(DIGITAL_ASSET_MODULE)

  const report: BackfillReport = {
    scanned: 0,
    digitalOrdersFound: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    errors: 0,
  }

  const take = 200
  let skip = 0

  while (true) {
    const orders = await fetchOrdersPage(query, skip, take)
    if (!orders.length) {
      break
    }

    const productIds = orders
      .flatMap((order) => (Array.isArray(order.items) ? order.items : []))
      .map((item) => normalizeScalar(item.product_id))
      .filter(Boolean)
    const productMap = await fetchProductMap(productModuleService, productIds)
    const productAssetMap = await fetchProductAssetMap(digitalAssetService, productIds)

    for (const order of orders) {
      report.scanned++

      for (const item of Array.isArray(order.items) ? order.items : []) {
        const productId = normalizeScalar(item.product_id)
        if (!productId) continue
        const product = productMap.get(productId)
        const assetProduct = productAssetMap.get(productId)

        item.variant = {
          ...(item.variant || {}),
          product: {
            ...(item.variant?.product || {}),
            ...(product || {}),
            ...(assetProduct || {}),
          },
        }
      }

      if (!isPaidOrder(order)) {
        continue
      }

      const items = Array.isArray(order.items) ? order.items : []
      const digitalItems = items.filter(isDigitalItem)

      if (!digitalItems.length) {
        continue
      }

      let customerId = order.customer_id || (order as any).customer?.id
      if (!customerId) {
        try {
          const { data } = await query.graph({
            entity: "order",
            fields: ["customer_id", "customer.id"],
            filters: { id: order.id }
          })
          customerId = data?.[0]?.customer_id || data?.[0]?.customer?.id
        } catch (e) {}
      }
      order.customer_id = customerId

      if (!order.customer_id) {
        report.errors++
        console.error(`Order ${order.id}: missing customer_id, skipping digital items`)
        continue
      }

      report.digitalOrdersFound++
      console.log(`Order ${order.id.slice(0, 8)}: ${digitalItems.length} digital item(s)`)

      for (const item of digitalItems) {
        const metadata = resolveEntitlementMetadata(item)

        try {
          let existing = await digitalAssetService.listDigitalOrderDownloads(
            {
              order_id: order.id,
              line_item_id: item.id,
            },
            { take: 1 }
          )

          if (!existing?.length) {
            existing = await digitalAssetService.listDigitalOrderDownloads(
              {
                order_id: order.id,
                product_id: item.product_id,
                customer_id: order.customer_id,
              },
              { take: 1 }
            )
          }

          if (Array.isArray(existing) && existing.length > 0) {
            const record = existing[0]
            let needsUpdate = false
            const updatePayload: any = { id: record.id }

            if (!record.customer_id && order.customer_id) {
              updatePayload.customer_id = order.customer_id
              needsUpdate = true
            }
            const resolvedVariantId = item.variant_id || item.variant?.id
            if (!record.variant_id && resolvedVariantId) {
              updatePayload.variant_id = resolvedVariantId
              needsUpdate = true
            }
            if (record.status === "payment_required" || record.status !== "active") {
              updatePayload.status = "active"
              needsUpdate = true
            }
            if (!record.is_active) {
              updatePayload.is_active = true
              needsUpdate = true
            }
            if (!record.is_paid) {
              updatePayload.is_paid = true
              needsUpdate = true
            }

            // Check and set/merge improved metadata fields
            const recordMeta = record.metadata || {}
            const improvedMeta = {
              title: recordMeta.title || item.title || "Digital Download",
              is_digital: true,
              version: recordMeta.version || metadata.version,
              file_name: recordMeta.file_name || metadata.fileName,
              mime_type: recordMeta.mime_type || metadata.mimeType,
              file_size: recordMeta.file_size || metadata.fileSize,
              storage_key: recordMeta.storage_key || metadata.storageKey,
              download_limit: recordMeta.download_limit || metadata.downloadLimit,
              download_expiry_days: recordMeta.download_expiry_days || metadata.expiryDays,
              digital_asset_key: recordMeta.digital_asset_key || metadata.digitalAssetKey,

              order_id: recordMeta.order_id || order.id,
              customer_id: recordMeta.customer_id || order.customer_id,
              line_item_id: recordMeta.line_item_id || item.id,
              product_id: recordMeta.product_id || item.product_id,
              variant_id: recordMeta.variant_id || resolvedVariantId || null,
              asset_id: recordMeta.asset_id || metadata.digitalAssetId || null,
              filename: recordMeta.filename || metadata.fileName || null,
              remaining_downloads: recordMeta.remaining_downloads !== undefined ? recordMeta.remaining_downloads : record.remaining_downloads,
              status: recordMeta.status || record.status || "active",
            }

            let metaDiff = false
            for (const key of Object.keys(improvedMeta)) {
              if (recordMeta[key] !== (improvedMeta as any)[key]) {
                metaDiff = true
                break
              }
            }

            if (metaDiff) {
              updatePayload.metadata = {
                ...recordMeta,
                ...improvedMeta,
              }
              needsUpdate = true
            }

            if (needsUpdate) {
              await digitalAssetService.updateDigitalOrderDownloads(updatePayload)
              report.recordsUpdated++
              console.log(`  - Item ${item.id.slice(0, 8)}: updated existing record (fixed fields)`)
            } else {
              report.recordsSkipped++
              console.log(`  - Item ${item.id.slice(0, 8)}: record exists and is correct, skipping`)
            }
            continue
          }

          await digitalAssetService.createDigitalOrderDownloads({
            order_id: order.id,
            line_item_id: item.id,
            product_id: item.product_id,
            customer_id: order.customer_id,
            variant_id: item.variant_id || item.variant?.id || undefined,
            digital_asset_id: metadata.digitalAssetId,
            remaining_downloads: metadata.downloadLimit,
            download_count: 0,
            license_key: null,
            expires_at: metadata.expiresAt,
            is_active: true,
            status: "active",
            is_paid: true,
            metadata: {
              title: item.title || "Digital Download",
              is_digital: true,
              version: metadata.version,
              file_name: metadata.fileName,
              mime_type: metadata.mimeType,
              file_size: metadata.fileSize,
              storage_key: metadata.storageKey,
              download_limit: metadata.downloadLimit,
              download_expiry_days: metadata.expiryDays,
              digital_asset_key: metadata.digitalAssetKey,

              // Improved metadata fields:
              order_id: order.id,
              customer_id: order.customer_id,
              line_item_id: item.id,
              product_id: item.product_id,
              variant_id: item.variant_id || item.variant?.id || null,
              asset_id: metadata.digitalAssetId,
              filename: metadata.fileName,
              status: "active",
              remaining_downloads: metadata.downloadLimit,
            },
          })

          report.recordsCreated++
          console.log(`  - Item ${item.id.slice(0, 8)}: created entitlement (remaining=${metadata.downloadLimit})`)
        } catch (error: any) {
          report.errors++
          console.error(`  - Item ${item.id.slice(0, 8)}: ERROR - ${error?.message || String(error)}`)
        }
      }
    }

    if (orders.length < take) {
      break
    }

    skip += take
  }

  console.log("\n=== Backfill Report ===")
  console.log(`scanned=${report.scanned}`)
  console.log(`digitalOrdersFound=${report.digitalOrdersFound}`)
  console.log(`recordsCreated=${report.recordsCreated}`)
  console.log(`recordsUpdated=${report.recordsUpdated}`)
  console.log(`recordsSkipped=${report.recordsSkipped}`)
  console.log(`errors=${report.errors}`)
}
