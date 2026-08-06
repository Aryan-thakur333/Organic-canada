// @ts-nocheck
import { authenticate } from "@medusajs/framework/http"
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import multer from "multer"
import path from "path"
import fs from "fs/promises"
import crypto from "crypto"
import { DIGITAL_ASSET_MODULE } from "../../../../modules/digital-asset"

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
const PRIVATE_STORAGE_DIR = path.join(process.cwd(), "uploads", "digital")

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/epub+zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/json",
  "application/octet-stream",
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 80,
    parts: 90,
  },
  fileFilter: (_req, file, cb) => {
    const mimetype = String(file?.mimetype || "application/octet-stream")
    if (ALLOWED_MIME_TYPES.has(mimetype)) {
      cb(null, true)
      return
    }
    cb(new Error(`Unsupported digital asset MIME type: ${mimetype}`))
  },
}).single("file")

const authenticateAdminSession = authenticate("user", ["session", "bearer"]) as unknown as (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => void | Promise<void>

function getAdminActorId(req: MedusaRequest): string {
  const reqAny = req as any
  return normalizeScalar(
    reqAny.auth_context?.actor_id ||
    reqAny.authContext?.actor_id ||
    reqAny.auth?.actor_id ||
    reqAny.user?.id ||
    reqAny.user_id
  )
}

function isAuthFailure(error: any): boolean {
  const status = Number(error?.status || error?.statusCode || error?.httpStatusCode)
  const message = String(error?.message || error || "").toLowerCase()
  return status === 401 || status === 403 || message.includes("unauthorized") || message.includes("jwt")
}

async function ensureAdminSession(req: MedusaRequest, res: MedusaResponse): Promise<boolean> {
  if (getAdminActorId(req)) {
    return true
  }

  try {
    await new Promise<void>((resolve, reject) => {
      authenticateAdminSession(req, res, ((error?: any) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      }) as MedusaNextFunction)
    })

    if (res.headersSent) {
      return false
    }

    const hasId = Boolean(getAdminActorId(req))
    if (!hasId && !res.headersSent) {
      res.status(401).json({ message: "Admin session unauthorized. Account mapping mismatch." })
      return false
    }

    return hasId
  } catch (error: any) {
    console.error("[Digital Product Exception Caught]: Admin session verification dropped.", error?.message || error)
    if (!res.headersSent) {
      res.status(401).json({ message: "Admin session expired. Please log out and sign back in." })
    }
    return false
  }
}

function parseMultipart(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    upload(req as any, res as any, (error: any) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function normalizeScalar(value: unknown): string {
  if (Array.isArray(value)) return normalizeScalar(value[0])
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function parseBoolean(value: unknown): boolean {
  const normalized = normalizeScalar(value).toLowerCase()
  return ["true", "1", "yes", "on"].includes(normalized)
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(normalizeScalar(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function normalizeCatalogPriceAmount(input: unknown, currencyCode: string): number {
  const raw = String(input ?? "").trim()

  // Reject negative/signed inputs up front: the digit-stripping below would
  // otherwise silently convert "-5.00" into a positive $5.00 price.
  if (raw.includes("-") || raw.includes("+")) {
    throw new Error(`${currencyCode.toUpperCase()}_PRICE_INVALID`)
  }

  const normalized = raw.replace(/[^0-9.]/g, "")

  if (!normalized) {
    throw new Error(`${currencyCode.toUpperCase()}_PRICE_REQUIRED`)
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${currencyCode.toUpperCase()}_PRICE_MAX_TWO_DECIMALS`)
  }

  const value = Number(normalized)

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${currencyCode.toUpperCase()}_PRICE_INVALID`)
  }

  return Math.round((value + Number.EPSILON) * 100) / 100
}

function parseJsonField<T>(value: unknown, fallback: T, fieldName: string): T {
  if (value === undefined || value === null || value === "") {
    return fallback
  }

  if (typeof value !== "string") {
    return value as T
  }

  try {
    return JSON.parse(value) as T
  } catch (error) {
    console.warn(`[Digital Product] Failed to parse ${fieldName} JSON:`, error)
    return fallback
  }
}

function safeHandle(title: string): string {
  const handle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return handle || `digital-product-${Date.now().toString(36)}`
}

function sanitizeFileName(fileName: string): string {
  const parsed = path.parse(fileName || "download.bin")
  const base = parsed.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/(^-|-$)/g, "")
  const ext = parsed.ext.replace(/[^a-zA-Z0-9.]+/g, "").slice(0, 16)
  return `${base || "download"}${ext || ".bin"}`
}

function readCadPriceInput(body: Record<string, unknown>): string {
  return normalizeScalar(body.price_cad) || normalizeScalar(body.price)
}

async function ensureStorageDirectory(): Promise<string> {
  await fs.mkdir(PRIVATE_STORAGE_DIR, { recursive: true })
  return PRIVATE_STORAGE_DIR
}

async function writeDigitalAssetFile(file: any, assetId: string): Promise<{
  storageDir: string
  storageKey: string
  diskFileName: string
  filePath: string
}> {
  const storageDir = await ensureStorageDirectory()
  const sanitized = sanitizeFileName(file.originalname)
  const diskFileName = `${assetId}-${sanitized}`
  const filePath = path.join(storageDir, diskFileName)
  const resolvedStorageDir = path.resolve(storageDir)
  const resolvedFilePath = path.resolve(filePath)

  if (!resolvedFilePath.startsWith(resolvedStorageDir + path.sep)) {
    throw new Error("Resolved upload path escaped the digital asset directory.")
  }

  await fs.writeFile(resolvedFilePath, file.buffer)

  return {
    storageDir,
    storageKey: `uploads/digital/${diskFileName}`,
    diskFileName,
    filePath: resolvedFilePath,
  }
}

async function removePartialAssetFile(filePath: string) {
  try {
    if (filePath) {
      await fs.unlink(filePath)
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.error("[Digital Product] Failed to remove partial asset file:", error?.stack || error)
    }
  }
}

function internalError(res: MedusaResponse, error: any) {
  console.error("[Digital Product Upload Error]", error?.stack || error)
  if (!res.headersSent) {
    return res.status(500).json({
      success: false,
      message: "Asset ingestion process failed gracefully",
      error: "Asset ingestion process failed gracefully",
      details: error?.message || String(error),
    })
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const isAuthorized = await ensureAdminSession(req, res)
    if (!isAuthorized) {
      return
    }

    const digitalAssetService: any = req.scope.resolve(DIGITAL_ASSET_MODULE)
    const productService: any = req.scope.resolve(Modules.PRODUCT)

    // List all digital assets
    let assets: any[] = []
    try {
      assets = await digitalAssetService.listDigitalAssets(
        {},
        { take: 200, order: { created_at: "DESC" } }
      )
    } catch (listErr: any) {
      console.error("[Digital Product GET] listDigitalAssets failed:", listErr?.message)
      assets = []
    }

    if (!assets.length) {
      return res.json({ products: [] })
    }

    // Batch-load associated products
    const productIds = [...new Set(assets.map((a: any) => a.product_id).filter(Boolean))]
    let products: any[] = []
    try {
      if (productIds.length) {
        products = await productService.listProducts(
          { id: productIds },
          { take: productIds.length }
        )
      }
    } catch (prodErr: any) {
      console.error("[Digital Product GET] listProducts failed:", prodErr?.message)
    }

    const productMap = new Map(products.map((p: any) => [p.id, p]))

    const items = assets.map((asset: any) => {
      const product = productMap.get(asset.product_id) || {}
      return {
        id: asset.id,
        product_id: asset.product_id,
        product_title: product.title || null,
        product_handle: product.handle || null,
        product_thumbnail: product.thumbnail || null,
        product_status: product.status || null,
        file_name: asset.file_name,
        mime_type: asset.mime_type,
        file_size: asset.file_size,
        download_limit: asset.download_limit,
        download_count: asset.download_count,
        is_active: asset.is_active,
        secure_s3_key: asset.secure_s3_key,
        created_at: asset.created_at,
      }
    })

    return res.json({ products: items })
  } catch (error: any) {
    return internalError(res, error)
  }
}
async function auditAndFixDigitalProduct(req: MedusaRequest, {
  productId,
  cadInputPrice,
  cadPriceNormalized,
  usdInputPrice,
  usdPriceNormalized,
  assetPayload,
}: any) {
  const productService: any = req.scope.resolve(Modules.PRODUCT)
  const storeService: any = req.scope.resolve(Modules.STORE)
  let remoteLink: any;
  try {
    remoteLink = req.scope.resolve("remoteLink")
  } catch (e) {}

  const query: any = req.scope.resolve("query")

  // 1. Re-fetch product
  let [product] = await productService.listProducts(
    { id: productId },
    {
      relations: ["variants"],
      take: 1,
    }
  )

  if (!product) {
    throw new Error("DIGITAL_PRODUCT_NOT_STOREFRONT_READY: Product not found after creation.")
  }

  // 2. Status
  if (product.status !== ProductStatus.PUBLISHED) {
    await productService.updateProducts([
      { id: productId, status: ProductStatus.PUBLISHED }
    ])
  }

  // 3. Sales Channel check via query graph
  let salesChannels: any[] = []
  try {
    const { data: [graphProduct] } = await query.graph({
      entity: "product",
      fields: ["id", "sales_channels.*"],
      filters: { id: productId }
    })
    salesChannels = graphProduct?.sales_channels || []
  } catch (err) {
    console.warn("[Digital Product] query.graph sales_channels check failed:", err?.message)
  }

  if (!salesChannels.length && remoteLink) {
    // Find default sales channel
    try {
      const [store] = await storeService.listStores({}, { relations: ["default_sales_channel"], take: 1 })
      const scId = store?.default_sales_channel_id || store?.default_sales_channel?.id || store?.default_sales_channel_id
      if (scId) {
        await remoteLink.create({
          [Modules.PRODUCT]: { product_id: productId },
          "sales_channel": { sales_channel_id: scId }
        })
        salesChannels = [{ id: scId }]
      }
    } catch (scErr) {
      console.warn("[Digital Product] Failed to link sales channel automatically", scErr?.message)
    }
  }

  // 4. Variant and 5. Variant Metadata
  let variant = (product.variants || [])[0]
  if (variant) {
    const vMeta = variant.metadata || {}
    if (!vMeta.is_digital || vMeta.requires_shipping !== false) {
      await productService.updateProductVariants([
        {
          id: variant.id,
          metadata: {
            ...vMeta,
            is_digital: true,
            requires_shipping: false,
            download_assets: vMeta.download_assets || [assetPayload]
          }
        }
      ])
    }
  }

  // 6. Product Metadata
  const pMeta = product.metadata || {}
  if (!pMeta.is_digital || pMeta.requires_shipping !== false) {
    await productService.updateProducts([
      {
        id: productId,
        metadata: {
          ...pMeta,
          is_digital: true,
          requires_shipping: false,
          download_assets: pMeta.download_assets || [assetPayload]
        }
      }
    ])
  }

  // 8. Final Refetch
  const [finalProduct] = await productService.listProducts(
    { id: productId },
    {
      relations: ["variants", "type"],
      take: 1,
    }
  )

  let finalChannels: any[] = []
  let finalVariantsWithPrices: any[] = []
  try {
    const { data: [graphProduct] } = await query.graph({
      entity: "product",
      fields: ["id", "sales_channels.*", "variants.*", "variants.prices.*"],
      filters: { id: productId }
    })
    finalChannels = graphProduct?.sales_channels || []
    finalVariantsWithPrices = graphProduct?.variants || []
  } catch (err) {}
  
  const finalPrices = finalVariantsWithPrices.flatMap((v: any) => v.prices || [])
  const finalCad = finalPrices.find((p: any) => String(p.currency_code || "").toLowerCase() === "cad")
  const finalUsd = finalPrices.find((p: any) => String(p.currency_code || "").toLowerCase() === "usd")

  const cadStoredAmount = finalCad?.amount ?? null
  const usdStoredAmount = finalUsd?.amount ?? null
  const cadPriceValid = Boolean(finalCad) && cadStoredAmount === cadPriceNormalized
  const usdWasProvided = Boolean(normalizeScalar(usdInputPrice))
  const usdPriceValid = usdWasProvided ? Boolean(finalUsd) && usdStoredAmount === usdPriceNormalized : null

  const storefrontReady = 
    finalProduct.status === ProductStatus.PUBLISHED &&
    Boolean(finalProduct.handle) &&
    finalChannels.length > 0 &&
    finalVariantsWithPrices.length > 0 &&
    cadPriceValid &&
    finalProduct.metadata?.is_digital === true &&
    finalVariantsWithPrices[0]?.metadata?.is_digital === true

  return {
    product: finalProduct,
    debug: {
      product_id: productId,
      status: finalProduct.status,
      handle: finalProduct.handle,
      sales_channel_linked: finalChannels.length > 0,
      sales_channel_ids: finalChannels.map((sc: any) => sc.id),
      variant_count: finalVariantsWithPrices.length,
      variant_id: finalVariantsWithPrices[0]?.id || null,
      cad_input_price: cadInputPrice,
      cad_price_normalized: cadPriceNormalized,
      cad_stored_amount: cadStoredAmount,
      cad_price_found: Boolean(finalCad),
      cad_price_valid: cadPriceValid,
      usd_input_price: normalizeScalar(usdInputPrice) || null,
      usd_price_normalized: usdWasProvided ? usdPriceNormalized : null,
      usd_stored_amount: usdStoredAmount,
      usd_price_found: Boolean(finalUsd),
      usd_price_valid: usdPriceValid,
      metadata_is_digital: Boolean(finalProduct.metadata?.is_digital),
      variant_metadata_is_digital: Boolean(finalVariantsWithPrices[0]?.metadata?.is_digital),
      download_assets_count: (finalProduct.metadata?.download_assets || []).length,
      storefront_ready: storefrontReady,

      input_price: cadInputPrice,
      price_normalized: cadPriceNormalized,
      stored_price_amount: cadStoredAmount,
      expected_price_amount: cadPriceNormalized,
      price_valid: cadPriceValid,
      price_amount: cadStoredAmount,
    }
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const isAuthorized = await ensureAdminSession(req, res)
    if (!isAuthorized) {
      return
    }

    await fs.mkdir("./uploads/digital", { recursive: true })

    const contentType = String(req.headers?.["content-type"] || "")
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return res.status(400).json({
        success: false,
        message: "Content-Type must be multipart/form-data.",
      })
    }

    try {
      await parseMultipart(req, res)
    } catch (parseError: any) {
      if (parseError?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "Digital asset file is too large. Maximum allowed size is 50 MB.",
          error: parseError.message,
        })
      }

      if (parseError?.code?.startsWith?.("LIMIT_")) {
        return res.status(400).json({
          success: false,
          message: "Invalid multipart digital product payload.",
          error: parseError.message,
        })
      }

      return internalError(res, parseError)
    }

    const body = ((req as any).body || {}) as Record<string, unknown>
    const file = (req as any).file

    const title = normalizeScalar(body.title)
    const subtitle = normalizeScalar(body.subtitle)
    const description = normalizeScalar(body.description)
    const version = normalizeScalar(body.version) || "1.0.0"
    const releaseNotes = normalizeScalar(body.release_notes)
    const extraMetadata = parseJsonField<Record<string, any>>(body.metadata || body.extra_metadata, {}, "metadata")
    const downloadExpiryDays = parsePositiveInteger(
      body.download_expiry_days || body.expiry_days || body.expires_in_days,
      365
    )
    const downloadLimit = parsePositiveInteger(body.download_limit, 5)
    const licenseRequired = parseBoolean(
      body.license_required ?? body.generate_license_key ?? body.generate_license
    )
    const cadPriceInput = readCadPriceInput(body)
    const usdPriceInput = normalizeScalar(body.price_usd)

    if (!title) {
      return res.status(400).json({ success: false, message: "Product title is required." })
    }

    if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
      return res.status(400).json({ success: false, message: "A digital asset file is required." })
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return res.status(413).json({
        success: false,
        message: "Digital asset file is too large. Maximum allowed size is 50 MB.",
      })
    }

    let cadPriceNormalized = 0
    let usdPriceNormalized: number | null = null
    try {
      cadPriceNormalized = normalizeCatalogPriceAmount(cadPriceInput, "cad")
      if (usdPriceInput) {
        usdPriceNormalized = normalizeCatalogPriceAmount(usdPriceInput, "usd")
      }
    } catch (priceError: any) {
      return res.status(400).json({
        success: false,
        message: priceError?.message || "PRICE_INVALID",
        error: priceError?.message || "PRICE_INVALID",
      })
    }

    const pricePayload = [
      {
        currency_code: "cad",
        amount: cadPriceNormalized,
      },
    ]
    if (usdPriceNormalized !== null) {
      pricePayload.push({
        currency_code: "usd",
        amount: usdPriceNormalized,
      })
    }

    const assetId = `asset_${crypto.randomBytes(16).toString("hex")}`
    const { storageKey, filePath } = await writeDigitalAssetFile(file, assetId)

    const salesChannelService: any = req.scope.resolve(Modules.SALES_CHANNEL)
    const [salesChannel] = await salesChannelService.listSalesChannels({ is_disabled: false }, { take: 1 })
    if (!salesChannel?.id) {
      throw new Error("No active sales channel is configured.")
    }

    const productService: any = req.scope.resolve(Modules.PRODUCT)
    const [existingType] = await productService.listProductTypes({ value: "Digital Product" }, { take: 1 })
    let typeId = existingType?.id
    if (!typeId) {
      const [createdType] = await productService.createProductTypes([{ value: "Digital Product" }])
      typeId = createdType.id
    }

    const nowToken = Date.now().toString(36)
    const handle = `${safeHandle(title)}-${nowToken}`
    const originalFileName = sanitizeFileName(file.originalname)
    const mimeType = file.mimetype || "application/octet-stream"
    const fileType = String(mimeType).split("/").pop() || "bin"

    const digitalAssetDescriptor = {
      id: assetId,
      key: assetId,
      digital_asset_key: assetId,
      filename: originalFileName,
      file_name: originalFileName,
      mime_type: mimeType,
      size: file.size,
      file_size: file.size,
      version,
      storage_key: storageKey,
      expires_in_days: downloadExpiryDays,
      download_limit: downloadLimit,
      license_required: licenseRequired,
    }

    const productMetadata = {
      ...extraMetadata,
      is_digital: true,
      requires_shipping: false,
      digital_asset_key: assetId,
      version,
      download_limit: downloadLimit,
      download_expiry_days: downloadExpiryDays,
      license_required: licenseRequired,
      file_name: originalFileName,
      file_size: file.size,
      file_type: fileType,
      mime_type: mimeType,
      storage_key: storageKey,
      release_notes: releaseNotes || undefined,
      download_assets: [digitalAssetDescriptor],
    }

    let workflowResult: any = null
    try {
      const productWorkflowInput = {
        products: [
          {
            title,
            subtitle: subtitle || undefined,
            description: description || `Digital product: ${title}`,
            handle,
            status: ProductStatus.PUBLISHED,
            type_id: typeId,
            sales_channels: [{ id: salesChannel.id }],
            options: [{ title: "Format", values: ["Digital"] }],
            variants: [
              {
                title: "Default",
                sku: `DIGITAL-${nowToken.toUpperCase()}`,
                prices: pricePayload,
                options: { Format: "Digital" },
                manage_inventory: false,
                allow_backorder: true,
                metadata: {
                  is_digital: true,
                  requires_shipping: false,
                  digital_asset_key: assetId,
                  storage_key: storageKey,
                  version,
                  download_limit: downloadLimit,
                  download_expiry_days: downloadExpiryDays,
                  license_required: licenseRequired,
                  download_assets: [digitalAssetDescriptor],
                },
              },
            ],
            metadata: productMetadata,
          },
        ],
      }

      const { result } = await createProductsWorkflow(req.scope).run({
        input: productWorkflowInput,
      })
      workflowResult = result
    } catch (workflowError: any) {
      console.error("[Digital Product Workflow Block Failure]:", workflowError?.stack || workflowError)
      await removePartialAssetFile(filePath)
      return res.status(422).json({
        success: false,
        message: "Workflow verification failed",
        error: "Workflow verification failed",
        details: workflowError?.message || String(workflowError),
      })
    }

    const product = workflowResult?.[0]
    if (!product?.id) {
      throw new Error("Product creation workflow completed without returning a product.")
    }

    let digitalAssetRecord: any = null
    try {
      const digitalAssetService: any = req.scope.resolve(DIGITAL_ASSET_MODULE)
      const [createdAsset] = await digitalAssetService.createDigitalAssets([
        {
          product_id: product.id,
          secure_s3_key: storageKey,
          file_name: originalFileName,
          mime_type: mimeType,
          file_size: file.size,
          version,
          is_primary: true,
          sort_order: 0,
          download_limit: downloadLimit,
          download_count: 0,
          is_active: true,
          metadata: {
            digital_asset_key: assetId,
            storage_key: storageKey,
            download_expiry_days: downloadExpiryDays,
            license_required: licenseRequired,
            release_notes: releaseNotes || undefined,
            disk_path: filePath,
          },
        },
      ])
      digitalAssetRecord = createdAsset

      if (createdAsset?.id) {
        try {
          const remoteLink: any = req.scope.resolve("remoteLink")
          await remoteLink.create({
            [Modules.PRODUCT]: { product_id: product.id },
            [DIGITAL_ASSET_MODULE]: { digital_asset_id: createdAsset.id },
          })
        } catch (linkError: any) {
          if (!/already exists|duplicate/i.test(String(linkError?.message || linkError))) {
            console.error("[Digital Product] Failed to link digital asset:", linkError?.stack || linkError)
          }
        }
      }
    } catch (assetError: any) {
      console.error("[Digital Product] Failed to create DigitalAsset record:", assetError?.stack || assetError)
    }

    // --- Post-creation verification: run auto-fix audit ---
    const assetPayload = {
      digital_asset_key: assetId,
      storage_key: storageKey,
      download_expiry_days: downloadExpiryDays,
      license_required: licenseRequired,
    }
    
    let auditResult: any = null
    try {
      auditResult = await auditAndFixDigitalProduct(req, {
        productId: product.id,
        cadInputPrice: cadPriceInput,
        cadPriceNormalized,
        usdInputPrice: usdPriceInput,
        usdPriceNormalized,
        assetPayload
      })
    } catch (auditErr: any) {
      console.error("[Digital Product] Audit and fix failed:", auditErr?.message)
      return res.status(500).json({
        success: false,
        message: "DIGITAL_PRODUCT_NOT_STOREFRONT_READY",
        error: auditErr?.message
      })
    }

    console.log("[Digital Product Created]", JSON.stringify(auditResult?.debug, null, 2))

    if (!auditResult?.debug?.cad_price_found || !auditResult?.debug?.cad_price_valid) {
      return res.status(500).json({
        success: false,
        message: "DIGITAL_PRODUCT_CAD_PRICE_NOT_LINKED",
        error: "Product created but CAD price could not be verified."
      })
    }

    if (usdPriceInput && auditResult?.debug?.usd_price_valid !== true) {
      return res.status(500).json({
        success: false,
        message: "DIGITAL_PRODUCT_USD_PRICE_NOT_LINKED",
        error: "Product created but USD price could not be verified."
      })
    }

    if (!auditResult?.debug?.storefront_ready) {
       console.warn("[Digital Product] Product created but not storefront ready:", auditResult?.debug)
    }

    return res.status(201).json({
      success: true,
      type: "success",
      message: "Digital product created and published successfully.",
      product: auditResult?.product,
      digital_asset: {
        id: assetId.replace("asset_", "da_"),
        record_id: digitalAssetRecord?.id || null,
        file_name: originalFileName,
        file_size: file.size,
        mime_type: mimeType,
      },
      asset: {
        id: assetId,
        record_id: digitalAssetRecord?.id || null,
        filename: originalFileName,
        file_name: originalFileName,
        size: file.size,
        file_size: file.size,
        mime_type: mimeType,
        version,
        storage_key: storageKey,
        disk_path: filePath,
        download_limit: downloadLimit,
        download_expiry_days: downloadExpiryDays,
        license_required: licenseRequired,
      },
      debug: auditResult?.debug,
    })
  } catch (error: any) {
    return internalError(res, error)
  }
}
