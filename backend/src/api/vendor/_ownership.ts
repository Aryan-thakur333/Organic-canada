// @ts-nocheck

export { asArray } from "../../utils/as-array"

export const productBelongsToVendor = (product: any, vendorId: string) => {
  if (!product) return false
  const linkedVendors = Array.isArray(product.vendor) ? product.vendor : product.vendor ? [product.vendor] : []
  return (
    linkedVendors.some((vendor: any) => vendor?.id === vendorId) ||
    product?.vendor?.id === vendorId ||
    product?.metadata?.vendor_id === vendorId
  )
}

export async function getVendorOwnedProducts(query: any, vendorId: string, extraFields: string[] = []) {
  if (!query || !vendorId) return []

  const baseFields = [
    "id",
    "title",
    "handle",
    "description",
    "thumbnail",
    "status",
    "metadata",
    "created_at",
    "vendor.id",
    "vendor.store_name",
    "variants.id",
    "variants.title",
    "variants.sku",
    "variants.manage_inventory",
    "variants.allow_backorder",
  ]

  const allExtraFields = [...new Set([...baseFields, ...extraFields])]
  const fields = allExtraFields.filter((field) => !field.startsWith("vendor."))

  try {
    // Try to get products linked via the vendor module
    const { data: linkedData } = await query.graph({
      entity: "vendor",
      fields: fields.map((field) => `product.${field}`),
      filters: { id: vendorId },
    })

    const { data: allProducts } = await query.graph({
      entity: "product",
      fields: allExtraFields,
      pagination: { take: 1000 },
    })

    const byId = new Map<string, any>()

    // Add products linked through the vendor module
    const linkedProducts = linkedData?.[0]?.product
    const linkedArray = Array.isArray(linkedProducts) ? linkedProducts : linkedProducts ? [linkedProducts] : []
    for (const product of linkedArray) {
      if (product?.id) {
        byId.set(product.id, {
          ...product,
          vendor: product.vendor || { id: vendorId },
        })
      }
    }

    // Add products linked via metadata.vendor_id
    const allProductsArray = Array.isArray(allProducts) ? allProducts : allProducts ? [allProducts] : []
    for (const product of allProductsArray) {
      if (!product?.id) continue
      if (byId.has(product.id)) continue
      if (productBelongsToVendor(product, vendorId)) {
        byId.set(product.id, product)
      }
    }

    return Array.from(byId.values())
  } catch (error) {
    console.error("[Vendor Ownership] Error fetching vendor products:", error)
    return []
  }
}

export async function getVendorProductIdSets(query: any, vendorId: string) {
  try {
    const products = await getVendorOwnedProducts(query, vendorId, ["variants.id"])

    if (!Array.isArray(products)) {
      return { products: [], productIds: new Set(), variantIds: new Set() }
    }

    const productIds = new Set<string>()
    const variantIds = new Set<string>()

    for (const product of products) {
      if (product?.id) productIds.add(product.id)
      const variants = Array.isArray(product?.variants) ? product.variants : []
      for (const variant of variants) {
        if (variant?.id) variantIds.add(variant.id)
      }
    }

    return { products, productIds, variantIds }
  } catch (error) {
    console.error("[Vendor Ownership] Error getting product ID sets:", error)
    return { products: [], productIds: new Set(), variantIds: new Set() }
  }
}
