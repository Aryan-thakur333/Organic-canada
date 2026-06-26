// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateProductsWorkflow, deleteProductsWorkflow } from "@medusajs/medusa/core-flows"
import { Modules, ProductStatus } from "@medusajs/framework/utils"

const asArray = (value: any) => !value ? [] : Array.isArray(value) ? value : [value]

function vendorOwnsProduct(product: any, vendorId: string) {
  return asArray(product?.vendor).some((vendor: any) => vendor?.id === vendorId) ||
    product?.vendor?.id === vendorId ||
    product?.metadata?.vendor_id === vendorId
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  const { id } = req.params
  const {
    title,
    description,
    thumbnail,
    price,
    variants,
    categories,
    tags,
    status,
  } = req.body as any

  const query = req.scope.resolve("query")

  try {
    // 1. Verify ownership of the product
    const { data: productsData } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "metadata",
        "vendor.id",
        "variants.id",
        "variants.title",
        "variants.sku",
        "variants.prices.id",
        "variants.prices.amount",
        "variants.prices.currency_code",
      ],
      filters: { id }
    })
    const product = productsData?.[0]

    if (!product) {
      return res.status(404).json({ message: "Product not found" })
    }

    if (!vendorOwnsProduct(product, vendor.id)) {
      return res.status(403).json({ message: "You do not own this product" })
    }

    // 2. Prepare update payload
    const updatePayload: any = {
      id,
      title: title || undefined,
      description: description || undefined,
      thumbnail: thumbnail || undefined,
      metadata: {
        ...(product.metadata || {}),
        vendor_id: vendor.id,
        vendor_store_name: vendor.store_name || null,
      },
    }

    // Status (publish/unpublish)
    if (status) {
      updatePayload.status = status === "draft" ? ProductStatus.DRAFT : ProductStatus.PUBLISHED
    }

    // Categories
    if (categories !== undefined) {
      updatePayload.categories = categories.map((c: any) => ({
        id: typeof c === "string" ? c : c.id,
      }))
    }

    // Tags
    if (tags !== undefined) {
      updatePayload.tags = tags.map((t: any) => ({
        id: typeof t === "string" ? t : t.id,
        value: typeof t === "string" ? t : t.value,
      }))
    }

    // Variants
    const regionService: any = req.scope.resolve(Modules.REGION)
    const [region] = await regionService.listRegions({}, { take: 1 })
    const currencyCode = region?.currency_code || "usd"

    if (Array.isArray(variants) && variants.length > 0) {
      updatePayload.variants = variants.map((v: any, idx: number) => {
        const existingVariant = product.variants?.[idx]
        const variantPayload: any = {
          title: v.title || "Variant",
          sku: v.sku || undefined,
          manage_inventory: v.manage_inventory !== false,
          allow_backorder: v.allow_backorder === true,
          prices: Array.isArray(v.prices)
            ? v.prices.map((p: any) => ({
                id: p.id || undefined,
                amount: Math.round(Number(p.amount)),
                currency_code: p.currency_code || currencyCode,
              }))
            : [
                {
                  id: existingVariant?.prices?.[0]?.id || undefined,
                  amount: Math.round(Number(v.price || price || 0) * 100),
                  currency_code: currencyCode,
                },
              ],
        }

        // Set the variant ID if updating an existing variant
        if (existingVariant?.id && !v._new) {
          variantPayload.id = existingVariant.id
        }

        return variantPayload
      })
    } else if (price !== undefined) {
      // Backward-compat: single price update on first variant
      const defaultVariant = product.variants?.[0]
      if (defaultVariant) {
        const priceId = defaultVariant.prices?.[0]?.id
        updatePayload.variants = [
          {
            id: defaultVariant.id,
            prices: [
              {
                id: priceId || undefined,
                amount: Math.round(Number(price) * 100),
                currency_code: currencyCode,
              },
            ],
          },
        ]
      }
    }

    // 3. Update product using Medusa's native workflow
    const { result } = await updateProductsWorkflow(req.scope).run({
      input: {
        products: [updatePayload],
      },
    })

    return res.json({
      message: "Product updated successfully",
      product: result[0],
    })
  } catch (error: any) {
    console.error("Error updating vendor product:", error)
    return res.status(500).json({ message: error.message || "Failed to update product" })
  }
}

export const PUT = PATCH

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  const { id } = req.params

  const query = req.scope.resolve("query")

  try {
    // 1. Verify ownership
    const { data: productsData } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "metadata",
        "vendor.id"
      ],
      filters: { id }
    })
    const product = productsData?.[0]

    if (!product) {
      return res.status(404).json({ message: "Product not found" })
    }

    if (!vendorOwnsProduct(product, vendor.id)) {
      return res.status(403).json({ message: "You do not own this product" })
    }

    // 2. Delete product using Medusa's native workflow
    await deleteProductsWorkflow(req.scope).run({
      input: {
        ids: [id]
      }
    })

    return res.json({
      message: "Product deleted successfully",
      id
    })
  } catch (error: any) {
    console.error("Error deleting vendor product:", error)
    return res.status(500).json({ message: error.message || "Failed to delete product" })
  }
}
