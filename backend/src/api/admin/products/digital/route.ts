import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { DIGITAL_ASSET_MODULE } from "../../../../modules/digital-asset"
import multer from "multer"
import path from "path"
import fs from "fs"
import crypto from "crypto"

const STORAGE_DIR = path.join(process.cwd(), "uploads", "digital")

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "text/plain",
  "application/octet-stream",
  "application/json",
  "text/csv",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
]

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed. Allowed: PDF, ZIP, DOCX, XLSX, PNG, JPG, TXT`))
    }
  },
}).single("file")

const toHandle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

const parsePrice = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null
}

/**
 * GET /admin/products/digital
 * List all digital assets with their linked product info (title, handle, thumbnail).
 * Returns an empty array when no digital products exist.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query: any = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // Use the Medusa query engine to fetch digital assets with linked product fields.
    // The link definition (digital-asset-product.ts) connects Product → DigitalAsset,
    // so we query from the product side and include the linked digital assets.
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "thumbnail",
        "status",
        "created_at",
        "digital_asset.id",
        "digital_asset.product_id",
        "digital_asset.secure_s3_key",
        "digital_asset.file_name",
        "digital_asset.mime_type",
        "digital_asset.file_size",
        "digital_asset.download_limit",
        "digital_asset.download_count",
        "digital_asset.is_active",
        "digital_asset.created_at",
      ],
      pagination: { take: 200 },
    })

    // Flatten the response: each product with its digital assets as individual entries
    const items: any[] = []
    for (const product of products || []) {
      const assets = product.digital_asset || []
      for (const asset of assets) {
        items.push({
          id: asset.id,
          product_id: product.id,
          product_title: product.title,
          product_handle: product.handle,
          product_thumbnail: product.thumbnail,
          product_status: product.status,
          file_name: asset.file_name,
          mime_type: asset.mime_type,
          file_size: asset.file_size,
          download_limit: asset.download_limit,
          download_count: asset.download_count,
          is_active: asset.is_active,
          secure_s3_key: asset.secure_s3_key,
          created_at: asset.created_at || product.created_at,
        })
      }
    }

    return res.json({ products: items })
  } catch (error: any) {
    console.error("[Digital Product] List error:", error)
    return res.status(500).json({ message: error.message || "Failed to list digital products" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return new Promise<void>((resolve) => {
    upload(req, res, async (uploadError: any) => {
      if (uploadError) {
        const message = uploadError.code === "LIMIT_FILE_SIZE"
          ? "File too large. Maximum allowed size is 50 MB."
          : uploadError.message || "File upload failed."
        res.status(400).json({ message })
        return resolve()
      }

      try {
        const file = (req as any).file as any
        const body = req.body as Record<string, string | undefined>
        const title = String(body.title || "").trim()
        const description = String(body.description || "").trim()

        // Parse dynamic prices from form data (price_cad, price_usd, price_eur, etc.)
        const prices: { amount: number; currency_code: string }[] = []
        for (const key of Object.keys(body)) {
          if (key.startsWith("price_")) {
            const currencyCode = key.replace("price_", "").toLowerCase()
            const amount = parsePrice(body[key])
            if (amount !== null) {
              prices.push({ amount, currency_code: currencyCode })
            }
          }
        }

        const version = String(body.version || "1.0.0").trim()
        const downloadExpiryDays = Math.max(1, Number(body.download_expiry_days) || 365)
        const licenseRequired = body.license_required === "true"

        if (!title) {
          res.status(400).json({ message: "Product title is required." })
          return resolve()
        }
        if (!file) {
          res.status(400).json({ message: "A digital asset file is required." })
          return resolve()
        }
        if (prices.length === 0) {
          res.status(400).json({ message: "At least one valid price is required (CAD minimum)." })
          return resolve()
        }
        // Ensure CAD is present
        const hasCadPrice = prices.some(p => p.currency_code === "cad")
        if (!hasCadPrice) {
          res.status(400).json({ message: "CAD price is required (primary store currency)." })
          return resolve()
        }

        // Ensure storage directory exists
        if (!fs.existsSync(STORAGE_DIR)) {
          fs.mkdirSync(STORAGE_DIR, { recursive: true })
        }

        // Generate unique storage key and save file
        const assetId = `asset_${crypto.randomBytes(16).toString("hex")}`
        const ext = path.extname(file.originalname) || ".bin"
        const storageKey = `digital/${assetId}${ext}`
        const filePath = path.join(STORAGE_DIR, `${assetId}${ext}`)
        fs.writeFileSync(filePath, file.buffer)

        const salesChannelService: any = req.scope.resolve(Modules.SALES_CHANNEL)
        const [salesChannel] = await salesChannelService.listSalesChannels(
          { is_disabled: false },
          { take: 1 }
        )
        if (!salesChannel) throw new Error("No active sales channel is configured")

        const handle = `${toHandle(title)}-${Date.now().toString(36)}`

        const actualDownloadLimit = Math.max(0, Number(body.download_limit) || 5)

        // ── Digital product metadata ────────────────────────────────────────
        const digitalMetadata: Record<string, any> = {
          is_digital: true,
          requires_shipping: false,
          version,
          download_limit: actualDownloadLimit,
          download_expiry_days: downloadExpiryDays,
          license_required: licenseRequired,
          file_name: file.originalname,
          file_size: file.size,
          file_type: (file.mimetype || "application/octet-stream").split("/").pop() || "bin",
          mime_type: file.mimetype || "application/octet-stream",
          download_assets: [{
            id: assetId,
            filename: file.originalname,
            mime_type: file.mimetype || "application/octet-stream",
            size: file.size,
            version,
            storage_key: storageKey,
          }],
        }

        // Resolve product types to find or create "Digital Product" type
        const productTypeService: any = req.scope.resolve(Modules.PRODUCT)
        let productType = await productTypeService.listProductTypes(
          { value: "Digital Product" },
          { take: 1 }
        )
        let typeId = productType?.[0]?.id
        if (!typeId) {
          const [newType] = await productTypeService.createProductTypes([
            { value: "Digital Product" },
          ])
          typeId = newType.id
        }

        const { result } = await createProductsWorkflow(req.scope).run({
          input: {
            products: [{
              title,
              description: description || `Digital product: ${title}`,
              handle,
              status: ProductStatus.PUBLISHED,
              type_id: typeId,
              sales_channels: [{ id: salesChannel.id }],
              options: [{ title: "Format", values: ["Digital"] }],
              variants: [{
                title: "Digital Download",
                sku: `DIGITAL-${Date.now()}`,
                prices,
                options: { Format: "Digital" },
                manage_inventory: false,
                allow_backorder: true,
                metadata: {
                  is_digital: true,
                  requires_shipping: false,
                },
              }],
              metadata: digitalMetadata,
            }],
          },
        })
        const product = result[0]

        // ── Create DigitalAsset database record ────────────────────────────
        // Persist a proper DigitalAsset row so the download pipeline (order-placed
        // subscriber, store download routes) can query it by ID instead of relying
        // solely on metadata JSON lookups.
        try {
          const digitalAssetService: any = req.scope.resolve(DIGITAL_ASSET_MODULE)
          const remoteLink: any = req.scope.resolve("remoteLink")

          const [digitalAsset] = await digitalAssetService.createDigitalAssets([{
            product_id: product.id,
            secure_s3_key: storageKey,
            file_name: file.originalname,
            mime_type: file.mimetype || "application/octet-stream",
            file_size: file.size,
            version,
            is_primary: true,
            sort_order: 0,
            download_limit: actualDownloadLimit,
            download_count: 0,
            is_active: true,
            metadata: {
              storage_key: storageKey,
              download_expiry_days: downloadExpiryDays,
              license_required: licenseRequired,
              release_notes: String(body.release_notes || "").trim() || undefined,
            },
          }])

          // Create remote link between Product and DigitalAsset
          try {
            await remoteLink.create({
              [Modules.PRODUCT]: { product_id: product.id },
              [DIGITAL_ASSET_MODULE]: { digital_asset_id: digitalAsset.id },
            })
          } catch (linkErr: any) {
            if (!/already exists|duplicate/i.test(String(linkErr?.message || linkErr))) {
              throw linkErr
            }
          }

          console.log(
            `[Digital Product] Created DigitalAsset record ${digitalAsset.id} ` +
            `for product ${product.id} (${title})`
          )
        } catch (assetErr: any) {
          // Non-fatal: the product was created successfully. The DigitalAsset
          // record can be created manually from the admin panel if needed.
          console.error(`[Digital Product] Failed to create DigitalAsset record:`, assetErr.message)
        }

        res.status(201).json({
          message: "Digital product created and published successfully.",
          product: { id: product.id, title: product.title, handle: product.handle },
          asset: {
            id: assetId,
            filename: file.originalname,
            size: file.size,
            mime_type: file.mimetype || "application/octet-stream",
            storage_key: storageKey,
          },
        })
      } catch (error: any) {
        console.error("[Digital Product] Creation error:", error)
        res.status(500).json({ message: error.message || "Failed to create digital product." })
      }
      resolve()
    })
  })
}
