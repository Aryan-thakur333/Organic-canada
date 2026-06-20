// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateProductsWorkflow, deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  const { id } = req.params
  const { title, description, thumbnail, price } = req.body as any

  const query = req.scope.resolve("query")

  try {
    // 1. Verify ownership of the product
    const { data: productsData } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "vendor.id",
        "variants.id",
        "variants.prices.id"
      ],
      filters: { id }
    })
    const product = productsData?.[0]

    if (!product) {
      return res.status(404).json({ message: "Product not found" })
    }

    if (product.vendor?.id !== vendor.id) {
      return res.status(403).json({ message: "You do not own this product" })
    }

    // 2. Prepare update payload
    const updatePayload: any = {
      id,
      title: title || undefined,
      description: description || undefined,
      thumbnail: thumbnail || undefined,
    }

    const defaultVariant = product.variants?.[0]
    if (price !== undefined && defaultVariant) {
      const priceId = defaultVariant.prices?.[0]?.id
      updatePayload.variants = [
        {
          id: defaultVariant.id,
          prices: [
            {
              id: priceId || undefined,
              amount: Math.round(Number(price) * 100),
              currency_code: "usd",
            }
          ]
        }
      ]
    }

    // 3. Update product using Medusa's native workflow
    const { result } = await updateProductsWorkflow(req.scope).run({
      input: {
        products: [updatePayload]
      }
    })

    return res.json({
      message: "Product updated successfully",
      product: result[0]
    })
  } catch (error: any) {
    console.error("Error updating vendor product:", error)
    return res.status(500).json({ message: error.message || "Failed to update product" })
  }
}

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
        "vendor.id"
      ],
      filters: { id }
    })
    const product = productsData?.[0]

    if (!product) {
      return res.status(404).json({ message: "Product not found" })
    }

    if (product.vendor?.id !== vendor.id) {
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
