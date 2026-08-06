import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DIGITAL_ASSET_MODULE } from "../../../../../modules/digital-asset"
import path from "path"
import { createReadStream } from "fs"
import { stat } from "fs/promises"

type QueryGraphInput = {
  entity: string
  fields: string[]
  filters?: Record<string, unknown>
  pagination?: {
    take?: number
    skip?: number
  }
}

type QueryGraphResult<T> = {
  data?: T[]
}

type QueryGraphService = {
  graph<T = Record<string, unknown>>(input: QueryGraphInput): Promise<QueryGraphResult<T>>
}

type DigitalAssetService = {
  retrieveDigitalAsset(id: string): Promise<DigitalAssetRecord>
  listDigitalAssets(
    filters: Record<string, unknown>,
    config?: {
      take?: number
      select?: string[]
    }
  ): Promise<DigitalAssetRecord[]>
  listDigitalOrderDownloads(
    filters: Record<string, unknown>,
    config?: {
      take?: number
      select?: string[]
    }
  ): Promise<DigitalOrderDownloadRecord[]>
  updateDigitalOrderDownloads(data: {
    id: string
    remaining_downloads?: number
    download_count?: number
    last_downloaded_at?: Date
  }): Promise<DigitalOrderDownloadRecord>
}

type JsonMap = Record<string, unknown>

type StoreLineItem = {
  id?: string
  title?: string
  product_id?: string
  variant_id?: string
  metadata?: JsonMap | null
}

type StoreOrder = {
  id: string
  customer_id?: string
  status?: string
  payment_status?: string
  items?: StoreLineItem[]
}

type VariantRecord = {
  id: string
  title?: string
  sku?: string
  metadata?: JsonMap | null
}

type DigitalAssetRecord = {
  id?: string
  secure_s3_key?: string
  file_name?: string
  mime_type?: string
  file_size?: number
  metadata?: JsonMap | null
}

type DigitalOrderDownloadRecord = {
  id: string
  order_id: string
  line_item_id?: string | null
  product_id?: string | null
  customer_id: string
  digital_asset_id?: string | null
  remaining_downloads: number
  download_count: number
  expires_at?: string | Date | null
  is_active?: boolean
  metadata?: JsonMap | null
}

type DownloadDescriptor = {
  assetKey: string
  storageKey: string
  fileName: string
  mimeType: string
}

type PurchasedOrderContext = {
  order: StoreOrder
  item: StoreLineItem
}

type EntitlementDecision = {
  downloadRecord: DigitalOrderDownloadRecord | null
  remainingAfterDownload: number | null
}

const PAID_PAYMENT_STATUSES = new Set<string>([
  "captured",
  "paid",
  "partially_refunded",
  "succeeded",
  "success",
  "settled",
  "charged",
  "complete",
  "completed",
  "payment_captured",
  "capture_complete",
  "capture_completed",
])

const COMPLETED_ORDER_STATUSES = new Set<string>([
  "completed",
  "fulfilled",
])

const DEFAULT_MIME_TYPE = "application/octet-stream"

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

function normalizeMetadata(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {}
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeScalar(value)
    if (normalized) return normalized
  }
  return ""
}

function normalizeAssetArray(value: unknown): JsonMap[] {
  return Array.isArray(value)
    ? value.filter((asset): asset is JsonMap => Boolean(asset) && typeof asset === "object" && !Array.isArray(asset))
    : []
}

function findAssetByKey(assets: JsonMap[], assetKey: string): JsonMap | null {
  if (!assetKey) return assets[0] || null

  return (
    assets.find((asset) => {
      const id = normalizeScalar(asset.id)
      const key = normalizeScalar(asset.key)
      const digitalAssetKey = normalizeScalar(asset.digital_asset_key)
      const assetId = normalizeScalar(asset.asset_id)
      return [id, key, digitalAssetKey, assetId].includes(assetKey)
    }) || assets[0] || null
  )
}

function sanitizeDownloadFileName(value: unknown): string {
  const raw = path.basename(firstNonEmpty(value, "download"))
  const parsed = path.parse(raw)
  const base = parsed.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/(^-|-$)/g, "")
  const ext = parsed.ext.replace(/[^a-zA-Z0-9.]+/g, "").slice(0, 24)
  return `${base || "download"}${ext || ""}`
}

function storageKeyToDiskFileName(storageKey: string): string {
  const cleaned = normalizeScalar(storageKey).replace(/\\/g, "/")
  if (!cleaned) return ""
  return path.basename(cleaned)
}

function buildCandidateFilePaths(storageKey: string, fileName: string): string[] {
  const diskName = storageKeyToDiskFileName(storageKey) || sanitizeDownloadFileName(fileName)
  if (!diskName) return []

  const publicDigitalDir = path.resolve(process.cwd(), "public", "uploads", "digital")
  const privateDigitalDir = path.resolve(process.cwd(), "uploads", "digital")

  const candidates = [
    path.resolve(publicDigitalDir, diskName),
    path.resolve(privateDigitalDir, diskName),
  ]

  return candidates.filter((candidate) => {
    const normalized = path.resolve(candidate)
    return (
      normalized.startsWith(publicDigitalDir + path.sep) ||
      normalized.startsWith(privateDigitalDir + path.sep)
    )
  })
}

async function selectExistingFilePath(storageKey: string, fileName: string): Promise<string | null> {
  const candidates = buildCandidateFilePaths(storageKey, fileName)

  for (const candidate of candidates) {
    try {
      const fileStat = await stat(candidate)
      if (fileStat.isFile() && fileStat.size > 0) {
        return candidate
      }
    } catch {
      continue
    }
  }

  return null
}

function isPaymentComplete(order: StoreOrder): boolean {
  const paymentStatus = normalizeFlag(order.payment_status)
  const orderStatus = normalizeFlag(order.status)

  if (PAID_PAYMENT_STATUSES.has(paymentStatus)) return true
  if (COMPLETED_ORDER_STATUSES.has(orderStatus)) return true
  if (paymentStatus.includes("captured") || paymentStatus.includes("capture_complete")) return true
  if (paymentStatus.includes("paid") || paymentStatus.includes("succeeded") || paymentStatus.includes("settled")) return true

  return false
}

function itemMatchesVariant(item: StoreLineItem, variantId: string): boolean {
  return normalizeScalar(item.variant_id) === variantId
}

function findPurchasedOrder(orders: StoreOrder[], customerId: string, variantId: string, orderId?: string): PurchasedOrderContext | null {
  for (const order of orders) {
    if (normalizeScalar(order.customer_id) !== customerId) continue
    if (orderId && normalizeScalar(order.id) !== orderId) continue
    if (!isPaymentComplete(order)) continue

    const items = Array.isArray(order.items) ? order.items : []
    for (const item of items) {
      if (itemMatchesVariant(item, variantId)) {
        return { order, item }
      }
    }
  }

  return null
}

function isExpiredDate(value: unknown): boolean {
  const raw = normalizeScalar(value)
  if (!raw) return false
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed < new Date()
}

async function fetchCustomerOrders(req: MedusaRequest, customerId: string): Promise<StoreOrder[]> {
  const query = req.scope.resolve("query") as QueryGraphService
  const { data: orders } = await query.graph<StoreOrder>({
    entity: "order",
    fields: ["id", "customer_id", "status", "payment_status", "items.*"],
    filters: { customer_id: customerId },
    pagination: { take: 200 },
  })

  return Array.isArray(orders) ? orders : []
}

async function fetchVariantRecord(req: MedusaRequest, variantId: string): Promise<VariantRecord | null> {
  const query = req.scope.resolve("query") as QueryGraphService
  const { data: variants } = await query.graph<VariantRecord>({
    entity: "variant",
    fields: ["id", "title", "sku", "metadata"],
    filters: { id: variantId },
    pagination: { take: 1 },
  })

  return Array.isArray(variants) ? variants[0] || null : null
}

async function fetchDigitalAssetRecord(req: MedusaRequest, assetKey: string): Promise<DigitalAssetRecord | null> {
  if (!assetKey) return null

  const digitalAssetService = req.scope.resolve(DIGITAL_ASSET_MODULE) as DigitalAssetService

  const byId = await digitalAssetService
    .retrieveDigitalAsset(assetKey)
    .catch(() => null)

  if (byId) return byId

  const matches = await digitalAssetService.listDigitalAssets(
    { id: assetKey },
    {
      take: 1,
      select: [
        "id",
        "secure_s3_key",
        "file_name",
        "mime_type",
        "file_size",
        "metadata",
      ],
    }
  )

  return Array.isArray(matches) ? matches[0] || null : null
}

async function validateExistingEntitlement(req: MedusaRequest, purchased: PurchasedOrderContext, customerId: string): Promise<EntitlementDecision> {
  const digitalAssetService = req.scope.resolve(DIGITAL_ASSET_MODULE) as DigitalAssetService
  const filters: Record<string, unknown> = {
    order_id: purchased.order.id,
    product_id: purchased.item.product_id,
    customer_id: customerId,
  }

  const records = await digitalAssetService.listDigitalOrderDownloads(filters, {
    take: 1,
    select: [
      "id",
      "order_id",
      "line_item_id",
      "product_id",
      "customer_id",
      "digital_asset_id",
      "remaining_downloads",
      "download_count",
      "expires_at",
      "is_active",
      "metadata",
    ],
  })

  const downloadRecord = Array.isArray(records) ? records[0] || null : null
  if (!downloadRecord) {
    return {
      downloadRecord: null,
      remainingAfterDownload: null,
    }
  }

  if (downloadRecord.is_active === false) {
    const error = new Error("This download is no longer available.")
    Object.assign(error, { statusCode: 403 })
    throw error
  }

  if (isExpiredDate(downloadRecord.expires_at)) {
    const error = new Error("This download has expired.")
    Object.assign(error, { statusCode: 403 })
    throw error
  }

  const remainingDownloads = Number(downloadRecord.remaining_downloads || 0)
  if (remainingDownloads <= 0) {
    const error = new Error("Download limit reached.")
    Object.assign(error, { statusCode: 403 })
    throw error
  }

  return {
    downloadRecord,
    remainingAfterDownload: Math.max(0, remainingDownloads - 1),
  }
}

async function markEntitlementDownloaded(req: MedusaRequest, decision: EntitlementDecision): Promise<void> {
  if (!decision.downloadRecord || decision.remainingAfterDownload === null) return

  const digitalAssetService = req.scope.resolve(DIGITAL_ASSET_MODULE) as DigitalAssetService
  await digitalAssetService.updateDigitalOrderDownloads({
    id: decision.downloadRecord.id,
    remaining_downloads: decision.remainingAfterDownload,
    download_count: Number(decision.downloadRecord.download_count || 0) + 1,
    last_downloaded_at: new Date(),
  })
}

function resolveAssetDescriptor(variant: VariantRecord, item: StoreLineItem, assetRecord: DigitalAssetRecord | null): DownloadDescriptor {
  const variantMeta = normalizeMetadata(variant.metadata)
  const itemMeta = normalizeMetadata(item.metadata)
  const assetMeta = normalizeMetadata(assetRecord?.metadata)

  const assetKey = firstNonEmpty(
    variantMeta.digital_asset_key,
    itemMeta.digital_asset_key,
    assetRecord?.id,
    assetMeta.digital_asset_key
  )

  const variantAsset = findAssetByKey(normalizeAssetArray(variantMeta.download_assets), assetKey)
  const itemAsset = findAssetByKey(normalizeAssetArray(itemMeta.download_assets), assetKey)

  const storageKey = firstNonEmpty(
    variantMeta.storage_key,
    itemMeta.storage_key,
    variantAsset?.storage_key,
    itemAsset?.storage_key,
    assetRecord?.secure_s3_key,
    assetMeta.storage_key
  )

  const fileName = sanitizeDownloadFileName(
    firstNonEmpty(
      variantMeta.file_name,
      variantMeta.download_file_name,
      itemMeta.file_name,
      itemMeta.download_file_name,
      variantAsset?.file_name,
      variantAsset?.filename,
      itemAsset?.file_name,
      itemAsset?.filename,
      assetRecord?.file_name,
      item.title,
      variant.title,
      "download"
    )
  )

  const mimeType = firstNonEmpty(
    variantMeta.mime_type,
    itemMeta.mime_type,
    variantAsset?.mime_type,
    itemAsset?.mime_type,
    assetRecord?.mime_type,
    DEFAULT_MIME_TYPE
  )

  return {
    assetKey,
    storageKey,
    fileName,
    mimeType,
  }
}

function validationError(res: MedusaResponse, status: number, message: string, detail?: string): void {
  res.status(status).json({
    message,
    ...(detail ? { detail } : {}),
  })
}

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = normalizeScalar((req as unknown as { auth_context?: { actor_id?: string } }).auth_context?.actor_id)
  if (!customerId) {
    res.status(401).json({ message: "Authentication required." })
    return
  }

  const variantId = normalizeScalar((req.params as Record<string, unknown>)?.variant_id)
  if (!variantId) {
    res.status(400).json({ message: "variant_id is required." })
    return
  }

  const orderIdParam = normalizeScalar((req.query as Record<string, unknown>)?.order_id)

  try {
    const orders = await fetchCustomerOrders(req, customerId)
    const purchased = findPurchasedOrder(orders, customerId, variantId, orderIdParam || undefined)

    if (!purchased) {
      validationError(res, 403, "You have not purchased this digital item or payment is not complete.")
      return
    }

    const variant = await fetchVariantRecord(req, variantId)
    if (!variant) {
      validationError(res, 404, "Digital product variant was not found.")
      return
    }

    let entitlementDecision: EntitlementDecision
    try {
      entitlementDecision = await validateExistingEntitlement(req, purchased, customerId)
    } catch (error: unknown) {
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 403
      const message = error instanceof Error ? error.message : "This download is no longer available."
      validationError(res, statusCode, message)
      return
    }

    const initialDescriptor = resolveAssetDescriptor(variant, purchased.item, null)
    const assetRecord = await fetchDigitalAssetRecord(req, initialDescriptor.assetKey)
    const descriptor = resolveAssetDescriptor(variant, purchased.item, assetRecord)

    if (!descriptor.storageKey) {
      validationError(
        res,
        422,
        "Digital asset metadata is incomplete. Please re-upload via admin panel.",
        "Missing storage_key or secure_s3_key on variant, line item, or digital asset record."
      )
      return
    }

    const filePath = await selectExistingFilePath(descriptor.storageKey, descriptor.fileName)
    if (!filePath) {
      res.status(404).json({
        message: "Digital asset missing from server local directories. Please re-upload via admin panel.",
      })
      return
    }

    const fileStat = await stat(filePath)
    if (!fileStat.isFile() || fileStat.size <= 0) {
      validationError(
        res,
        422,
        "Digital asset file is not a valid downloadable file. Please re-upload via admin panel."
      )
      return
    }

    res.setHeader("Content-Disposition", `attachment; filename="${descriptor.fileName}"`)
    res.setHeader("Content-Type", descriptor.mimeType || DEFAULT_MIME_TYPE)
    res.setHeader("Content-Length", String(fileStat.size))
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate")
    res.setHeader("Pragma", "no-cache")
    res.setHeader("Expires", "0")
    res.setHeader("X-Order-Id", purchased.order.id)
    res.setHeader("X-Variant-Id", variantId)
    res.setHeader("X-Payment-Verified", "true")
    if (entitlementDecision.remainingAfterDownload !== null) {
      res.setHeader("X-Remaining-Downloads", String(entitlementDecision.remainingAfterDownload))
    }

    await markEntitlementDownloaded(req, entitlementDecision)

    const stream = createReadStream(filePath)

    stream.on("error", (error: Error) => {
      console.error("[Download Generate Link] Stream error:", error)
      stream.destroy()
      if (!res.headersSent) {
        res.status(500).json({
          message: "Digital asset stream failed.",
          error: error.message,
        })
        return
      }
      res.destroy(error)
    })

    res.on("close", () => {
      stream.destroy()
    })

    stream.pipe(res)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[Download Generate Link] Route failure:", error)
    res.status(500).json({
      message: "Failed to stream digital asset.",
      error: message,
    })
  }
}
