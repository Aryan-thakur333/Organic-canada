import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

type ProductSeed = {
  title: string
  description: string
  handle: string
  price_eur: number   // price in EUR cents
  thumbnail: string
  vendor_name: string  // lookup key to find vendor_id
}

const PRODUCTS: ProductSeed[] = [
  {
    title: "Premium Organic Apples",
    description: "Crisp, juicy, and freshly picked organic apples from local orchards. Perfect for a healthy snack or baking.",
    handle: "premium-organic-apples",
    price_eur: 499,
    thumbnail: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6",
    vendor_name: "organic aryan pvt ltd",
  },
  {
    title: "Fresh Spinach Bunch",
    description: "Vibrant, nutrient-packed organic spinach leaves. Great for salads, smoothies, or sautés.",
    handle: "fresh-spinach-bunch",
    price_eur: 199,
    thumbnail: "https://images.unsplash.com/photo-1576045057995-568f588f82fb",
    vendor_name: "organic aryan pvt ltd",
  },
  {
    title: "Classic Italian Pasta (Whole Wheat)",
    description: "Authentic whole wheat pasta imported from Italy. Rich in fiber with a delightfully al dente texture.",
    handle: "classic-italian-pasta-whole-wheat",
    price_eur: 349,
    thumbnail: "https://images.unsplash.com/photo-1551462147-ff29053bfc14",
    vendor_name: "Verification Vendor Store",
  },
  {
    title: "Extra Virgin Olive Oil (500ml)",
    description: "Cold-pressed extra virgin olive oil from Tuscan groves. Perfect for dressings, dipping, and finishing dishes.",
    handle: "extra-virgin-olive-oil-500ml",
    price_eur: 1299,
    thumbnail: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5",
    vendor_name: "Verification Vendor Store",
  },
  {
    title: "Artisan Sourdough Bread",
    description: "Handcrafted sourdough with a crispy crust and soft, tangy crumb. Baked fresh daily using organic flour.",
    handle: "artisan-sourdough-bread",
    price_eur: 399,
    thumbnail: "https://images.unsplash.com/photo-1549931319-a5457534679b",
    vendor_name: "Aryan Pvt Ltd",
  },
]

export default async function seedVendorProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)

  logger.info("=== Seeding Vendor Marketplace Products ===\n")

  // ── 0. Idempotency check — skip if any products with these handles exist ─

  const allHandles = PRODUCTS.map((p) => p.handle)
  const { data: existingByHandle } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: allHandles },
  })

  if ((existingByHandle as Array<{ handle: string }>).length > 0) {
    const existing = existingByHandle as Array<{ handle: string }>
    logger.info(
      `Products already seeded (${existing.length} found with matching handles). Skipping.`
    )
    return
  }

  // ── 1. Resolve vendor IDs by name ──────────────────────────────────────

  const vendorNames = [...new Set(PRODUCTS.map((p) => p.vendor_name))]
  const { data: allVendors } = await query.graph({
    entity: "vendor",
    fields: ["id", "name", "store_name"],
  })

  const vendorMap = new Map<string, string>()
  for (const vendor of allVendors as Array<{ id: string; name: string; store_name: string }>) {
    const key = vendor.name || vendor.store_name
    if (key) vendorMap.set(key, vendor.id)
  }

  const missing = vendorNames.filter((name) => !vendorMap.has(name))
  if (missing.length > 0) {
    throw new Error(
      `Vendors not found in database: ${missing.join(", ")}. ` +
      `Run vendor registration first or check the vendor names.`
    )
  }

  logger.info(`Resolved ${vendorNames.length} vendor(s): ${vendorNames.join(", ")}`)

  // ── 2. Get default sales channel & shipping profile ─────────────────────

  const salesChannels = await salesChannelModule.listSalesChannels({
    name: "Default Sales Channel",
  })
  const sales_channel_id = salesChannels[0]?.id
  if (!sales_channel_id) {
    throw new Error("Default sales channel not found. Run the main seed first.")
  }

  const shippingProfiles = await fulfillmentModule.listShippingProfiles({
    type: "default",
  })
  const shipping_profile_id = shippingProfiles[0]?.id
  if (!shipping_profile_id) {
    throw new Error("Default shipping profile not found. Run the main seed first.")
  }

  // ── 3. Build product inputs ────────────────────────────────────────────

  const productsToCreate = PRODUCTS.map((p) => ({
    title: p.title,
    description: p.description,
    handle: p.handle,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id,
    thumbnail: p.thumbnail,
    images: [{ url: p.thumbnail }],
    options: [
      { title: "Package", values: ["Standard"] },
    ],
    variants: [
      {
        title: "Standard",
        sku: `VENDOR-${p.handle.toUpperCase().replace(/-/g, "_")}`,
        options: { Package: "Standard" },
        manage_inventory: false,
        prices: [
          { amount: p.price_eur, currency_code: "eur" },
        ],
      },
    ],
    sales_channels: [{ id: sales_channel_id }],
    metadata: {
      seeded_by: "vendor-products-seed",
    },
  }))

  // ── 4. Create products via native workflow ─────────────────────────────

  logger.info(`Creating ${productsToCreate.length} products...`)
  const { result: products } = await createProductsWorkflow(container).run({
    input: { products: productsToCreate },
  })
  logger.info(`✓ Created ${products.length} products`)

  // ── 5. Link each product to its vendor via the vendor-product link ──────

  const links: Array<Record<string, Record<string, string>>> = []
  for (const product of products) {
    const seed = PRODUCTS.find((p) => p.handle === product.handle)!
    const vendorId = vendorMap.get(seed.vendor_name)!

    links.push({
      [Modules.PRODUCT]: { product_id: product.id },
      vendor: { vendor_id: vendorId },
    })
  }

  await link.create(links)
  logger.info(`✓ Linked ${links.length} products to their vendors`)

  // ── 6. Summary ─────────────────────────────────────────────────────────

  for (const product of products) {
    const seed = PRODUCTS.find((p) => p.handle === product.handle)!
    logger.info(
      `  → ${seed.title} (€${(seed.price_eur / 100).toFixed(2)}) ` +
      `→ ${seed.vendor_name}`
    )
  }

  logger.info("\n=== Vendor Marketplace Products Seeded Successfully ===")
}
