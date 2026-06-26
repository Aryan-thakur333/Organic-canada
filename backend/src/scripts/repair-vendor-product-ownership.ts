// @ts-nocheck
/**
 * repair-vendor-product-ownership.ts
 *
 * Idempotent repair script that ensures every product with a vendor_id in
 * metadata also has a formal link-graph link to the vendor module, and that
 * every link-graph link also has a fallback metadata entry.
 *
 * Run: npx medusa exec ./src/scripts/repair-vendor-product-ownership.ts
 *
 * What it does:
 *   1. Scans all products that have metadata.vendor_id set.
 *   2. For each, checks whether the product→vendor link already exists.
 *   3. If missing, creates the link.
 *   4. Also scans all products WITHOUT metadata.vendor_id but WITH a vendor
 *      link, and backfills the metadata.
 *   5. Logs every repair action, and skips products that are already correct.
 *   6. Accepts a --dry-run flag to preview without making changes.
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../modules/vendor"

const asArray = (value: any) => (!value ? [] : Array.isArray(value) ? value : [value])

function isDryRun(): boolean {
  return process.argv.includes("--dry-run")
}

export default async function repairVendorProductOwnership({ container }: { container: MedusaContainer }) {
  const logger = container.resolve("logger")
  const query = container.resolve("query")
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
  const isDry = isDryRun()

  logger.info("=".repeat(60))
  logger.info(`[repair-vendor-product-ownership] Starting ${isDry ? "(DRY RUN — no changes)" : ""}`)
  logger.info("=".repeat(60))

  let repairedCount = 0
  let errorCount = 0
  let skippedCount = 0

  // ── Step 1: Get ALL vendors ────────────────────────────────────────────
  const { data: vendors } = await query.graph({
    entity: "vendor",
    fields: ["id", "store_name", "email"],
  })

  const vendorById = new Map<string, any>((vendors || []).map((v: any) => [v.id, v]))
  logger.info(`[repair] Found ${vendors?.length || 0} vendors in the system`)

  // ── Step 2: Get ALL products ────────────────────────────────────────────
  const { data: allProducts } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "status",
      "metadata",
      "vendor.id",
      "vendor.store_name",
    ],
    pagination: { take: 1000 },
  })

  const products = asArray(allProducts)
  logger.info(`[repair] Found ${products.length} products total`)

  // ── Step 3: Scan each product ──────────────────────────────────────────
  for (const product of products) {
    const vendorIdFromMetadata = product.metadata?.vendor_id
    const linkedVendors = asArray(product.vendor)
    const hasLink = linkedVendors.length > 0
    const hasMetadata = Boolean(vendorIdFromMetadata)

    // CASE A: Has metadata.vendor_id but no link → create link
    if (hasMetadata && !hasLink) {
      const vendor = vendorById.get(vendorIdFromMetadata)
      if (!vendor) {
        logger.warn(`[repair] ⚠ Product "${product.title}" (${product.id}) has metadata.vendor_id="${vendorIdFromMetadata}" but that vendor does not exist — skipping`)
        skippedCount++
        continue
      }

      if (isDry) {
        logger.info(`[repair] 🔧 WOULD create link: Product "${product.title}" → Vendor "${vendor.store_name}" (${vendor.id})`)
      } else {
        try {
          await remoteLink.create({
            [Modules.PRODUCT]: { product_id: product.id },
            [VENDOR_MODULE]: { vendor_id: vendor.id },
          })
          logger.info(`[repair] ✅ Created link: Product "${product.title}" → Vendor "${vendor.store_name}"`)
          repairedCount++
        } catch (err: any) {
          if (/already exists|duplicate/i.test(err?.message || "")) {
            logger.info(`[repair] ⏭ Link already exists (race): Product "${product.title}" → Vendor "${vendor.store_name}"`)
            skippedCount++
          } else {
            logger.error(`[repair] ❌ Failed to create link for product "${product.title}": ${err.message}`)
            errorCount++
          }
        }
      }
      continue
    }

    // CASE B: Has link but no metadata.vendor_id → backfill metadata
    if (!hasMetadata && hasLink) {
      const firstLinkedVendor = linkedVendors[0]
      if (!firstLinkedVendor?.id) {
        skippedCount++
        continue
      }

      if (isDry) {
        logger.info(`[repair] 🔧 WOULD backfill metadata.vendor_id="${firstLinkedVendor.id}" on Product "${product.title}"`)
      } else {
        try {
          const productService: any = container.resolve(Modules.PRODUCT)
          await productService.updateProducts(product.id, {
            metadata: {
              ...(product.metadata || {}),
              vendor_id: firstLinkedVendor.id,
              vendor_store_name: firstLinkedVendor.store_name || null,
            },
          })
          logger.info(`[repair] ✅ Backfilled metadata.vendor_id on Product "${product.title}" → Vendor "${firstLinkedVendor.store_name || firstLinkedVendor.id}"`)
          repairedCount++
        } catch (err: any) {
          logger.error(`[repair] ❌ Failed to backfill metadata for product "${product.title}": ${err.message}`)
          errorCount++
        }
      }
      continue
    }

    // CASE C: Has both link and metadata — but check for mismatch
    if (hasMetadata && hasLink) {
      const linkedVendorId = linkedVendors[0]?.id
      if (linkedVendorId && vendorIdFromMetadata !== linkedVendorId) {
        logger.warn(`[repair] ⚠ MISMATCH: Product "${product.title}" has metadata.vendor_id="${vendorIdFromMetadata}" but linked to vendor "${linkedVendorId}"`)

        if (!isDry) {
          try {
            // Remove old link
            await remoteLink.dismiss({
              [Modules.PRODUCT]: { product_id: product.id },
              [VENDOR_MODULE]: { vendor_id: linkedVendorId },
            })
            // Create new link to metadata vendor
            await remoteLink.create({
              [Modules.PRODUCT]: { product_id: product.id },
              [VENDOR_MODULE]: { vendor_id: vendorIdFromMetadata },
            })
            logger.info(`[repair] ✅ Relinked Product "${product.title}" from vendor "${linkedVendorId}" → "${vendorIdFromMetadata}"`)
            repairedCount++
          } catch (err: any) {
            logger.error(`[repair] ❌ Failed to relink product "${product.title}": ${err.message}`)
            errorCount++
          }
        }
      }
      // else: OK — product is correctly linked
    }

    // CASE D: Neither link nor metadata — skip (not a vendor product)
  }

  // ── Step 4: Summary ────────────────────────────────────────────────────
  logger.info("=".repeat(60))
  logger.info(`[repair-vendor-product-ownership] Complete ${isDry ? "(DRY RUN)" : ""}`)
  logger.info(`  ✅ Repaired / created links: ${repairedCount}`)
  logger.info(`  ⏭ Skipped (already correct / not applicable): ${skippedCount}`)
  logger.info(`  ❌ Errors: ${errorCount}`)
  logger.info("=".repeat(60))

  return { repaired: repairedCount, skipped: skippedCount, errors: errorCount }
}
