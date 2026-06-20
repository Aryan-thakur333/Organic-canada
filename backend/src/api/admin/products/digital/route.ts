import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { DIGITAL_ASSET_MODULE } from "../../../../modules/digital-asset"
import multer from "multer"
import os from "os"
import fs from "fs"

// ── Multer setup ────────────────────────────────────────────────────────────
// Parse a single file field named "file" along with text fields (title,
// price_eur, price_usd). Files are written to the OS temp directory before
// being uploaded to the remote storage provider.
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB cap
}).single("file")

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Sanitize a title into a URL-friendly handle. */
function toHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

/**
 * Validate and coerce a price value from the multipart form body.
 * Accepts both numeric strings and numbers.
 * Returns the amount in **cents** (smallest currency unit).
 */
function parsePrice(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  const num = typeof value === "string" ? parseFloat(value) : Number(value)
  if (Number.isNaN(num) || num < 0) return null
  // Convert user-facing decimal (e.g. 19.99) to cents (1999)
  return Math.round(num * 100)
}

// ── POST /admin/products/digital ────────────────────────────────────────────
//
//  Accepts multipart/form-data:
//    - title     (string)   – Product title
//    - price_eur (number)   – Price in EUR (e.g. 19.99)
//    - price_usd (number)   – Price in USD (e.g. 24.99)
//    - file      (binary)   – The digital asset file to sell
//
//  Flow:
//    1. Parse the multipart payload via multer
//    2. Upload the binary file to the registered storage provider
//    3. Create a core product (with a single "Digital Download" variant)
//       carrying both EUR and USD prices
//    4. Persist a DigitalAsset row linking the product_id ↔ file metadata
//    5. Establish the product ↦ digitalAsset remote link
//    6. Return a clean success payload for the admin panel toast notification
// ────────────────────────────────────────────────────────────────────────────

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return new Promise<void>((resolve) => {
    upload(req, res, async (err: any) => {
      // ── Multer error handling ─────────────────────────────────────────
      if (err) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "File too large. Maximum allowed size is 500 MB."
            : err.message || "File upload failed."

        console.error("[Digital Product] Multer error:", err)
        res.status(400).json({ message })
        return resolve()
      }

      try {
        const file = (req as any).file
        const body = req.body as Record<string, any>
        const title: string | undefined = body.title
        const priceEurRaw = body.price_eur
        const priceUsdRaw = body.price_usd

        // ── 1. Validate required fields ─────────────────────────────────
        if (!title || !title.trim()) {
          res.status(400).json({ message: "Product title is required." })
          return resolve()
        }

        if (!file) {
          res
            .status(400)
            .json({ message: "A digital asset file is required." })
          return resolve()
        }

        const priceEur = parsePrice(priceEurRaw)
        const priceUsd = parsePrice(priceUsdRaw)

        if (priceEur === null && priceUsd === null) {
          res.status(400).json({
            message:
              "At least one valid price (price_eur or price_usd) must be provided.",
          })
          return resolve()
        }

        // ── 2. Upload file via the registered storage provider ──────────
        const fileService: any = req.scope.resolve("fileService")
        let secureKey: string
        let uploadedFile: any

        if (fileService && typeof fileService.upload === "function") {
          const uploadResults = await fileService.upload([
            {
              filename: file.originalname,
              path: file.path,
              mimetype: file.mimetype,
            },
          ])
          // Clean up the temporary file from disk
          try {
            fs.unlinkSync(file.path)
          } catch { /* best-effort cleanup */ }
          uploadedFile = uploadResults?.[0]
          secureKey = uploadedFile?.key || uploadedFile?.url || file.filename
        } else {
          // Fallback: no file module registered — use the local temp path
          // as the key so the admin can still reference the asset.
          console.warn(
            "[Digital Product] No fileService with upload() found. " +
              "Falling back to local temp path. " +
              "Configure a file module in medusa-config.ts for production use."
          )
          secureKey = file.path
        }

        // ── 3. Create the core product with EUR/USD pricing ─────────────
        const handle = toHandle(title)
        const prices: Array<{ amount: number; currency_code: string }> = []

        if (priceEur !== null) {
          prices.push({ amount: priceEur, currency_code: "eur" })
        }
        if (priceUsd !== null) {
          prices.push({ amount: priceUsd, currency_code: "usd" })
        }

        const { result } = await createProductsWorkflow(req.scope).run({
          input: {
            products: [
              {
                title: title.trim(),
                description: `Digital product: ${title.trim()}`,
                handle,
                status: ProductStatus.PUBLISHED,
                options: [
                  { title: "Format", values: ["Digital Download"] },
                ],
                variants: [
                  {
                    title: "Digital Download",
                    sku: `DIGITAL-${handle.toUpperCase().replace(/-/g, "_")}`,
                    prices,
                    options: { Format: "Digital Download" },
                    manage_inventory: false,
                    allow_backorder: true,
                  },
                ],
              },
            ],
          },
        })

        const product = result[0]

        // ── 4. Persist the DigitalAsset record ─────────────────────────
        const digitalAssetService: any =
          req.scope.resolve(DIGITAL_ASSET_MODULE)
        const digitalAsset = await digitalAssetService.createDigitalAssets({
          product_id: product.id,
          secure_s3_key: secureKey,
          file_name: file.originalname,
          mime_type: file.mimetype,
          file_size: file.size,
          is_active: true,
        })

        // ── 5. Establish the remote link ────────────────────────────────
        const remoteLink = req.scope.resolve(
          ContainerRegistrationKeys.REMOTE_LINK
        )
        await remoteLink.create({
          [Modules.PRODUCT]: { product_id: product.id },
          [DIGITAL_ASSET_MODULE]: { digital_asset_id: digitalAsset.id },
        })

        console.log(
          `[Digital Product] Created product ${product.id} ` +
            `→ digital asset ${digitalAsset.id} (${file.originalname})`
        )

        // ── 6. Return success payload for admin UI toast ────────────────
        res.status(201).json({
          message: "Digital product created successfully.",
          type: "success",
          product: {
            id: product.id,
            title: product.title,
            handle: product.handle,
          },
          digital_asset: {
            id: digitalAsset.id,
            file_name: digitalAsset.file_name,
            mime_type: digitalAsset.mime_type,
            file_size: digitalAsset.file_size,
          },
        })
      } catch (error: any) {
        console.error("[Digital Product] Creation error:", error)

        const status =
          error.type === "not_found"
            ? 404
            : error.type === "invalid_data"
              ? 400
              : 500
        res.status(status).json({
          message: error.message || "Failed to create digital product.",
          type: "error",
        })
      }

      resolve()
    })
  })
}
