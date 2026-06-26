// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../../../modules/vendor"

const DEFAULT_OPTION_TITLE = "Default option"
const DEFAULT_OPTION_VALUE = "Default value"
const DEFAULT_STOCK = Math.max(1, Number(process.env.VENDOR_PRODUCT_DEFAULT_STOCK || 100))
const GROCERY_CATEGORIES = [
  ["Fruits", "fruits"],
  ["Vegetables", "vegetables"],
  ["Dairy", "dairy"],
  ["Bakery", "bakery"],
  ["Meat", "meat"],
  ["Seafood", "seafood"],
]

const asArray = (value: any) => {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

const productBelongsToVendor = (product: any, vendorId: string) => {
  const linkedVendors = asArray(product?.vendor)
  return (
    linkedVendors.some((vendor: any) => vendor?.id === vendorId) ||
    product?.vendor?.id === vendorId ||
    product?.metadata?.vendor_id === vendorId
  )
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
    const productFields = [
      "id",
      "title",
      "handle",
      "description",
      "thumbnail",
      "status",
      "created_at",
      "metadata",
      "vendor.id",
      "vendor.store_name",
      "categories.id",
      "categories.name",
      "categories.handle",
      "tags.id",
      "tags.value",
      "options.id",
      "options.title",
      "options.values",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.manage_inventory",
      "variants.allow_backorder",
      "variants.inventory_items.inventory_item_id",
      "variants.inventory_items.inventory.location_levels.stocked_quantity",
      "variants.inventory_items.inventory.location_levels.reserved_quantity",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.options.id",
      "variants.options.value",
    ]

    const { data: vendorData } = await query.graph({
      entity: "vendor",
      fields: [
        "product.id",
        "product.title",
        "product.handle",
        "product.description",
        "product.thumbnail",
        "product.status",
        "product.created_at",
        "product.categories.id",
        "product.categories.name",
        "product.categories.handle",
        "product.tags.id",
        "product.tags.value",
        "product.options.id",
        "product.options.title",
        "product.options.values",
        "product.variants.id",
        "product.variants.title",
        "product.variants.sku",
        "product.variants.manage_inventory",
        "product.variants.allow_backorder",
        "product.variants.inventory_items.inventory.location_levels.stocked_quantity",
        "product.variants.inventory_items.inventory.location_levels.reserved_quantity",
        "product.variants.prices.amount",
        "product.variants.prices.currency_code",
        "product.variants.options.id",
        "product.variants.options.value",
      ],
      filters: { id: vendor.id }
    })
    const linkedProducts = asArray(vendorData[0]?.product)

    const { data: allProducts } = await query.graph({
      entity: "product",
      fields: productFields,
      pagination: { take: 500 },
    })

    const productsById = new Map<string, any>()
    for (const product of linkedProducts) {
      productsById.set(product.id, product)
    }
    for (const product of asArray(allProducts)) {
      if (productBelongsToVendor(product, vendor.id)) {
        productsById.set(product.id, product)
      }
    }

    const products = Array.from(productsById.values())
      .filter((product) => productBelongsToVendor(product, vendor.id) || linkedProducts.some((p: any) => p.id === product.id))

    return res.json({ products })
  } catch (error: any) {
    console.error("Error fetching vendor products:", error)
    return res.status(500).json({ message: error.message || "Failed to fetch products" })
  }
}

const toHandle = (str: string) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

const isDuplicateLink = (error: any) =>
  /already exists|duplicate|multiple links|Cannot create multiple links/i.test(String(error?.message || error))

async function ensureRemoteLink(remoteLink: any, definition: Record<string, any>) {
  try {
    await remoteLink.create(definition)
  } catch (error) {
    if (!isDuplicateLink(error)) throw error
  }
}

async function ensureDefaultStockLocation(req: MedusaRequest, salesChannelId: string) {
  const stockLocationService: any = req.scope.resolve(Modules.STOCK_LOCATION)
  let [location] = await stockLocationService.listStockLocations({}, { take: 1 })

  if (!location) {
    const { result } = await createStockLocationsWorkflow(req.scope).run({
      input: {
        locations: [{
          name: "Eatsie Vendor Warehouse",
          address: {
            city: "Toronto",
            country_code: "CA",
            address_1: "Vendor marketplace stock",
          },
        }],
      },
    })
    location = result[0]
  }

  await linkSalesChannelsToStockLocationWorkflow(req.scope).run({
    input: { id: location.id, add: [salesChannelId] },
  })

  return location
}

async function ensureGroceryCategories(req: MedusaRequest) {
  const query = req.scope.resolve("query")
  const handles = GROCERY_CATEGORIES.map(([, handle]) => handle)
  const { data: existing } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "handle"],
    filters: { handle: handles },
  })

  const byHandle = new Map((existing || []).map((category: any) => [category.handle, category]))
  const missing = GROCERY_CATEGORIES
    .filter(([, handle]) => !byHandle.has(handle))
    .map(([name, handle]) => ({
      name,
      handle,
      is_active: true,
      is_internal: false,
    }))

  if (missing.length) {
    const { result } = await createProductCategoriesWorkflow(req.scope).run({
      input: { product_categories: missing },
    })
    for (const category of result) {
      byHandle.set(category.handle, category)
    }
  }

  return byHandle
}

async function resolveCategoryIds(req: MedusaRequest, categories: any[]) {
  const byHandle = await ensureGroceryCategories(req)
  const query = req.scope.resolve("query")
  const ids = new Set<string>()
  const lookupHandles: string[] = []

  for (const category of asArray(categories)) {
    const raw = typeof category === "string" ? category : category?.id || category?.handle || category?.name
    if (!raw) continue

    const value = String(raw).trim()
    if (value.startsWith("pcat_")) {
      ids.add(value)
      continue
    }

    const handle = toHandle(value)
    const groceryCategory = byHandle.get(handle)
    if (groceryCategory?.id) {
      ids.add(groceryCategory.id)
    } else {
      lookupHandles.push(handle)
    }
  }

  if (lookupHandles.length) {
    const { data } = await query.graph({
      entity: "product_category",
      fields: ["id", "handle"],
      filters: { handle: lookupHandles },
    })
    for (const category of data || []) {
      ids.add(category.id)
    }
  }

  return Array.from(ids)
}

function optionValueForVariant(v: any) {
  const title = String(v?.title || "Standard").trim() || "Standard"
  return title === "Standard" ? DEFAULT_OPTION_VALUE : title
}

function normalizeProductOptions(variants: any[] | null) {
  const submittedVariants = asArray(variants)

  if (submittedVariants.length <= 1) {
    return [{ title: DEFAULT_OPTION_TITLE, values: [DEFAULT_OPTION_VALUE] }]
  }

  const values = Array.from(new Set(submittedVariants.map(optionValueForVariant)))
  return [{ title: DEFAULT_OPTION_TITLE, values: values.length ? values : [DEFAULT_OPTION_VALUE] }]
}

function normalizeVariant(v: any, index: number, fallbackPrice: number | null, currencyCode: string, variantCount: number) {
  const title = String(v?.title || "Standard").trim() || "Standard"
  const optionValue = variantCount <= 1 ? DEFAULT_OPTION_VALUE : optionValueForVariant({ title })
  const sku = v?.sku || `VENDOR-${Date.now().toString(36)}-${index + 1}`
  const prices = Array.isArray(v?.prices) && v.prices.length
    ? v.prices.map((price: any) => ({
        amount: Math.round(Number(price.amount)),
        currency_code: String(price.currency_code || currencyCode).toLowerCase(),
      }))
    : [{
        amount: Math.round(Number(v?.price || fallbackPrice || 0) * 100),
        currency_code: currencyCode,
      }]

  return {
    title,
    sku,
    manage_inventory: v?.manage_inventory !== false,
    allow_backorder: v?.allow_backorder === true,
    options: {
      [DEFAULT_OPTION_TITLE]: optionValue,
    },
    prices,
  }
}

async function ensureVariantInventory(req: MedusaRequest, productId: string, salesChannelId: string, stockedQuantity = DEFAULT_STOCK) {
  const query = req.scope.resolve("query")
  const remoteLink = req.scope.resolve(ContainerRegistrationKeys.LINK)
  const inventoryService: any = req.scope.resolve(Modules.INVENTORY)
  const location = await ensureDefaultStockLocation(req, salesChannelId)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.manage_inventory",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { id: productId },
  })
  const product = products?.[0]
  if (!product) return

  for (const variant of asArray(product.variants)) {
    if (variant.manage_inventory === false) continue

    let inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id

    if (!inventoryItemId) {
      const { result } = await createInventoryItemsWorkflow(req.scope).run({
        input: {
          items: [{
            sku: variant.sku || `AUTO-${variant.id}`,
            title: `${product.title} - ${variant.title || "Standard"}`,
            location_levels: [{
              location_id: location.id,
              stocked_quantity: stockedQuantity,
            }],
          }],
        },
      })
      inventoryItemId = result[0].id

      await ensureRemoteLink(remoteLink, {
        [Modules.PRODUCT]: { variant_id: variant.id },
        [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
      })
    }

    const levels = await inventoryService.listInventoryLevels({
      inventory_item_id: inventoryItemId,
      location_id: location.id,
    })

    if (!levels.length) {
      await createInventoryLevelsWorkflow(req.scope).run({
        input: {
          inventory_levels: [{
            inventory_item_id: inventoryItemId,
            location_id: location.id,
            stocked_quantity: stockedQuantity,
          }],
        },
      })
    }
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendorId = getAuthenticatedVendorId(req)
  const {
    title,
    description,
    thumbnail,
    handle: requestedHandle,
    price,
    sku,
    category,
    inventory_quantity,
    variants,
    categories,
    tags,
    status,
  } = req.body as any

  if (!vendorId) {
    return res.status(401).json({ message: "Authenticated vendor session required" })
  }

  if (!String(title || "").trim()) {
    return res.status(400).json({ message: "A product title is required" })
  }

    // Require at least one variant with a positive price
  const submittedVariants = Array.isArray(variants) && variants.length > 0 ? variants : null
  const fallbackPrice = price ? Number(price) : null
  if (!submittedVariants && (!fallbackPrice || !Number.isFinite(fallbackPrice) || fallbackPrice <= 0)) {
    return res.status(400).json({ message: "At least one variant with a positive price is required" })
  }

  // Check if this is a digital product
  const body = req.body as any
  const isDigital = body.is_digital === true || body.is_digital === "true"
  const digitalVersion = body.digital_version || "1.0.0"
  const downloadLimit = Math.max(0, Number(body.download_limit) || 5)
  const downloadExpiryDays = Math.max(1, Number(body.download_expiry_days) || 365)
  const licenseRequired = body.license_required === true || body.license_required === "true"

  try {
    const salesChannelService: any = req.scope.resolve(Modules.SALES_CHANNEL)
    const regionService: any = req.scope.resolve(Modules.REGION)
    const fulfillmentService: any = req.scope.resolve(Modules.FULFILLMENT)
    const [salesChannel] = await salesChannelService.listSalesChannels({ is_disabled: false }, { take: 1 })
    const [region] = await regionService.listRegions({ currency_code: "cad" }, { take: 1 })
    const [shippingProfile] = await fulfillmentService.listShippingProfiles(
      { type: "default" },
      { take: 1 }
    )
    if (!salesChannel || !region || !shippingProfile) {
      return res.status(503).json({
        message: "Store region, sales channel, or default shipping profile is not configured",
      })
    }
    const baseHandle = toHandle(String(requestedHandle || title))
    const handle = baseHandle ? `${baseHandle}-${Date.now().toString(36)}` : `vendor-product-${Date.now().toString(36)}`
    const currencyCode = region?.currency_code || "cad"
    const productOptions = normalizeProductOptions(submittedVariants)
    const categoryIds = await resolveCategoryIds(req, categories !== undefined ? categories : category ? [category] : [])
    const stockedQuantity = Number.isInteger(Number(inventory_quantity)) && Number(inventory_quantity) >= 0
      ? Number(inventory_quantity)
      : DEFAULT_STOCK

    const workflowInput: any = {
      title,
      description: description || "",
      thumbnail: thumbnail || undefined,
      images: thumbnail ? [{ url: thumbnail }] : undefined,
      handle,
      status: status === "draft" ? ProductStatus.DRAFT : ProductStatus.PUBLISHED,
      metadata: {
        vendor_id: vendorId,
        vendor_store_name: (req as any).vendor?.store_name || null,
      },
      shipping_profile_id: shippingProfile.id,
      sales_channels: [{ id: salesChannel.id }],
      options: productOptions,
      variants: [],
    }

    if (submittedVariants) {
      workflowInput.variants = submittedVariants.map((v: any, index: number) =>
        normalizeVariant(v, index, fallbackPrice, currencyCode, submittedVariants.length)
      )
    } else {
      workflowInput.variants = [
        {
          title: "Standard",
          sku: sku || `VENDOR-${handle.toUpperCase()}`,
          manage_inventory: true,
          allow_backorder: false,
          prices: [
            {
              amount: Math.round(Number(fallbackPrice) * 100),
              currency_code: currencyCode,
            },
          ],
          options: { [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE },
        },
      ]
    }

    if (!workflowInput.variants.some((variant: any) =>
      variant.prices?.some((price: any) => Number(price.amount) > 0)
    )) {
      return res.status(400).json({ message: "At least one variant with a positive CAD price is required" })
    }

    if (categoryIds.length) {
      workflowInput.categories = categoryIds.map((id) => ({ id }))
    }

    // Attach tags if provided
    if (Array.isArray(tags) && tags.length > 0) {
      workflowInput.tags = tags.map((t: any) => ({
        id: typeof t === "string" ? t : t.id,
        value: typeof t === "string" ? t : t.value,
      }))
    }

    // For digital products: set metadata, disable inventory, no shipping profile needed
    if (isDigital) {
      workflowInput.metadata = {
        ...(workflowInput.metadata || {}),
        is_digital: true,
        version: digitalVersion,
        download_limit: downloadLimit,
        download_expiry_days: downloadExpiryDays,
        license_required: licenseRequired,
        requires_shipping: false,
      }
      // Mark all variants as non-inventory managed
      workflowInput.variants = (workflowInput.variants || []).map((v: any) => ({
        ...v,
        manage_inventory: false,
        allow_backorder: true,
      }))
    }

    const { result } = await createProductsWorkflow(req.scope).run({
      input: { products: [workflowInput] },
    })

    const product = result[0]

    const query = req.scope.resolve("query")
    const remoteLink = req.scope.resolve(ContainerRegistrationKeys.LINK)

    if (!(await vendorHasProduct(query, vendorId, product.id))) {
      try {
        await remoteLink.create({
          [Modules.PRODUCT]: { product_id: product.id },
          [VENDOR_MODULE]: { vendor_id: vendorId },
        })
      } catch (error: any) {
        const isDuplicateLinkError = isDuplicateLink(error)
        if (!isDuplicateLinkError) throw error
      }
    }

    // Skip inventory creation for digital products
    if (!isDigital) {
      await ensureVariantInventory(req, product.id, salesChannel.id, stockedQuantity)
    }

    const { data: createdProducts } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "description",
        "thumbnail",
        "status",
        "metadata",
        "vendor.id",
        "vendor.store_name",
        "categories.id",
        "categories.name",
        "categories.handle",
        "variants.id",
        "variants.title",
        "variants.sku",
        "variants.prices.amount",
        "variants.prices.currency_code",
        "variants.inventory_items.inventory_item_id",
        "variants.inventory_items.inventory.location_levels.stocked_quantity",
        "variants.inventory_items.inventory.location_levels.reserved_quantity",
      ],
      filters: { id: product.id },
    })

    return res.status(201).json({
      message: "Product created and linked successfully",
      product: createdProducts?.[0] || product,
    })
  } catch (error: any) {
    console.error("Error creating vendor product:", error)
    return res.status(500).json({ message: error.message || "Failed to create product" })
  }
}
