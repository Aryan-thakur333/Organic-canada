// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../../../modules/vendor"

const asArray = (value: any) => {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

const vendorHasProduct = async (query: any, vendorId: string, productId: string) => {
  const { data } = await query.graph({
    entity: "vendor",
    fields: ["product.id"],
    filters: { id: vendorId },
  })

  return asArray(data?.[0]?.product).some((product: any) => product.id === productId)
}

const getAuthenticatedVendorId = (req: MedusaRequest) => {
  const reqAny = req as any

  return (
    reqAny.vendor?.id ||
    reqAny.auth_context?.actor_id ||
    reqAny.authContext?.actor_id ||
    reqAny.session?.vendor_id ||
    reqAny.session?.vendorId
  )
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  const query = req.scope.resolve("query")

  try {
    const { data: vendorData } = await query.graph({
      entity: "vendor",
      fields: [
        "product.id",
        "product.title",
        "product.handle",
        "product.description",
        "product.thumbnail",
        "product.variants.id",
        "product.variants.title",
        "product.variants.prices.amount",
        "product.variants.prices.currency_code"
      ],
      filters: { id: vendor.id }
    })
    const products = asArray(vendorData[0]?.product)

    return res.json({ products })
  } catch (error: any) {
    console.error("Error fetching vendor products:", error)
    return res.status(500).json({ message: error.message || "Failed to fetch products" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendorId = getAuthenticatedVendorId(req)
  const { title, description, thumbnail, price } = req.body as any

  if (!vendorId) {
    return res.status(401).json({ message: "Authenticated vendor session required" })
  }

  if (!title || price === undefined) {
    return res.status(400).json({ message: "Title and price are required" })
  }

  try {
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

    const { result } = await createProductsWorkflow(req.scope).run({
      input: {
        products: [
          {
            title,
            description: description || "",
            thumbnail: thumbnail || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c", // fallback food image
            handle,
            status: ProductStatus.PUBLISHED,
            options: [{ title: "Size", values: ["Standard"] }],
            variants: [
              {
                title: "Standard",
                prices: [
                  {
                    amount: Math.round(Number(price) * 100), // convert dollars/cents to cents
                    currency_code: "usd",
                  }
                ],
                options: { Size: "Standard" }
              }
            ]
          }
        ]
      }
    })

    const product = result[0]

    const query = req.scope.resolve("query")
    const remoteLink = req.scope.resolve(ContainerRegistrationKeys.REMOTE_LINK)

    if (!(await vendorHasProduct(query, vendorId, product.id))) {
      try {
        await remoteLink.create({
          [Modules.PRODUCT]: { product_id: product.id },
          [VENDOR_MODULE]: { vendor_id: vendorId },
        })
      } catch (error: any) {
        const isDuplicateLinkError = error.message?.includes("Cannot create multiple links")

        if (!isDuplicateLinkError) {
          throw error
        }
      }
    }

    return res.status(201).json({
      message: "Product created and linked successfully",
      product,
    })
  } catch (error: any) {
    console.error("Error creating vendor product:", error)
    return res.status(500).json({ message: error.message || "Failed to create product" })
  }
}
