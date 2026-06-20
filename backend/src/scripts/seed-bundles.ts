import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle"

/**
 * Seed script: seed-bundles
 *
 * Creates test bundle mappings by grouping existing products into
 * 5-in-1 bundle configurations. Each bundle has a "parent" product
 * that acts as the bundle SKU in the storefront, and up to 5 "child"
 * products whose inventory is deducted when the bundle is purchased.
 *
 * The script auto-discovers products: the first N products become
 * bundle parents, and the remaining products are assigned as children
 * (up to 5 per parent). Named bundle defs are tried first; if the
 * named parents don't exist, dynamic assignment kicks in.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/seed-bundles.ts
 *
 * Idempotent: skips existing (parent_product_id, child_product_id) pairs.
 */
export default async function seedBundles({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const bundleService: any = container.resolve(BUNDLE_MODULE)

  logger.info("=== Seeding Bundle Mappings ===")

  // ── 1. Fetch existing published products ────────────────────────────────
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle"],
    filters: { status: "published" },
  })

  if (!products || products.length < 2) {
    logger.warn("Need at least 2 published products to create bundles. Skipping.")
    logger.warn("Run a product seed script first (e.g. npx medusa exec ./src/scripts/seed.ts)")
    return
  }

  logger.info(`Found ${products.length} published products`)

  // ── 2. Build handle→product_id lookup ───────────────────────────────────
  const byHandle = new Map<string, any>()
  const byTitleSlug = new Map<string, any>()

  for (const product of products) {
    const handle = (product.handle || "").toLowerCase()
    if (handle) byHandle.set(handle, product)

    const slug = product.title.toLowerCase().replace(/\s+/g, "-")
    byTitleSlug.set(slug, product)
  }

  const resolveProduct = (handleOrTitle: string): any | undefined => {
    return byHandle.get(handleOrTitle) || byTitleSlug.get(handleOrTitle)
  }

  // ── 3. Try named bundle definitions first ──────────────────────────────
  type BundleDef = {
    parent_title: string
    parent_handle: string
    children: Array<{ child_handle: string; quantity: number }>
  }

  const namedBundles: BundleDef[] = [
    {
      parent_title: "Organic Fruit Basket Bundle",
      parent_handle: "organic-fruit-basket",
      children: [
        { child_handle: "organic-gala-apples", quantity: 3 },
        { child_handle: "organic-bananas", quantity: 6 },
        { child_handle: "organic-blueberries", quantity: 2 },
        { child_handle: "organic-avocado", quantity: 2 },
        { child_handle: "organic-honey", quantity: 1 },
      ],
    },
    {
      parent_title: "Organic Dairy Breakfast Bundle",
      parent_handle: "organic-dairy-breakfast",
      children: [
        { child_handle: "organic-whole-milk", quantity: 2 },
        { child_handle: "organic-greek-yogurt", quantity: 4 },
        { child_handle: "organic-cheddar-cheese", quantity: 1 },
        { child_handle: "organic-free-range-eggs", quantity: 1 },
        { child_handle: "organic-sourdough-bread", quantity: 1 },
      ],
    },
    {
      parent_title: "Organic Protein Pack Bundle",
      parent_handle: "organic-protein-pack",
      children: [
        { child_handle: "organic-chicken-breast", quantity: 2 },
        { child_handle: "organic-ground-beef", quantity: 2 },
        { child_handle: "organic-atlantic-salmon", quantity: 1 },
        { child_handle: "organic-tofu", quantity: 2 },
        { child_handle: "organic-quinoa", quantity: 1 },
      ],
    },
  ]

  interface BundleMapping {
    parent_product_id: string
    child_product_id: string
    quantity: number
    sort_order: number
  }

  const allMappings: BundleMapping[] = []

  for (const def of namedBundles) {
    const parent = resolveProduct(def.parent_handle) || resolveProduct(def.parent_title)
    if (!parent) {
      logger.warn(`[${def.parent_title}] Parent not found — will use dynamic assignment instead`)
      continue
    }

    let childCount = 0
    for (let i = 0; i < def.children.length; i++) {
      const child = def.children[i]
      const childProduct = resolveProduct(child.child_handle)
      if (!childProduct) {
        logger.warn(`[${def.parent_title}] Child "${child.child_handle}" not found — skipping`)
        continue
      }

      allMappings.push({
        parent_product_id: parent.id,
        child_product_id: childProduct.id,
        quantity: child.quantity,
        sort_order: i,
      })
      childCount++
    }

    if (childCount > 0) {
      logger.info(`[${parent.title}] Found ${childCount}/${def.children.length} child products via named def`)
    }
  }

  // ── 4. Dynamic fallback: assign first N products as parents ────────────
  //     If fewer than 3 named bundles resolved, create dynamic bundles
  //     from the existing product pool.
  const parentIdsUsed = new Set(allMappings.map((m) => m.parent_product_id))
  const childIdsUsed = new Set(allMappings.map((m) => m.child_product_id))
  const allUsedIds = new Set([...parentIdsUsed, ...childIdsUsed])

  // Remaining products that haven't been used yet
  const availableProducts = products.filter((p: any) => !allUsedIds.has(p.id))

  if (availableProducts.length >= 3 && parentIdsUsed.size < 2) {
    logger.info(`Using dynamic assignment: ${availableProducts.length} unused products available`)

    // Take first 3 as parents (or fewer if not enough products)
    const numParents = Math.min(3, Math.floor(availableProducts.length / 2))
    const dynamicParents = availableProducts.slice(0, numParents)
    const dynamicChildren = availableProducts.slice(numParents)

    for (let pi = 0; pi < dynamicParents.length; pi++) {
      const parent = dynamicParents[pi]
      // Assign up to 5 children per parent
      const start = pi * 5
      const childrenForParent = dynamicChildren.slice(start, start + 5)

      if (childrenForParent.length === 0) break

      for (let ci = 0; ci < childrenForParent.length; ci++) {
        allMappings.push({
          parent_product_id: parent.id,
          child_product_id: childrenForParent[ci].id,
          quantity: ci + 1,
          sort_order: ci,
        })
      }

      logger.info(`[${parent.title}] Dynamic: assigned ${childrenForParent.length} child product(s)`)
    }
  }

  if (allMappings.length === 0) {
    logger.warn("No bundle mappings could be created.")
    const handles = Array.from(byHandle.keys()).join(", ")
    logger.info(`Available handles: ${handles || "none"}`)
    return
  }

  // ── 5. Check for existing mappings (idempotency) ────────────────────────
  const uniqueParentIds = [...new Set(allMappings.map((m) => m.parent_product_id))]

  const existingMappings: any[] = await bundleService.listBundleItems({
    parent_product_id: uniqueParentIds,
  })

  const existingSet = new Set(
    existingMappings.map((m: any) => `${m.parent_product_id}:${m.child_product_id}`)
  )

  const newMappings = allMappings.filter(
    (m) => !existingSet.has(`${m.parent_product_id}:${m.child_product_id}`)
  )

  if (newMappings.length === 0) {
    logger.info("All bundle mappings already exist. Nothing to seed.")
    return
  }

  // ── 6. Create the bundle mappings ──────────────────────────────────────
  const bundlesByParent = new Map<string, BundleMapping[]>()
  for (const mapping of newMappings) {
    const existing = bundlesByParent.get(mapping.parent_product_id) || []
    existing.push(mapping)
    bundlesByParent.set(mapping.parent_product_id, existing)
  }

  let created = 0
  for (const [parentProductId, mappings] of bundlesByParent) {
    const parentProduct = products.find((p: any) => p.id === parentProductId)
    const parentTitle = parentProduct?.title || parentProductId

    try {
      for (const mapping of mappings) {
        await bundleService.createBundleItems({
          parent_product_id: mapping.parent_product_id,
          child_product_id: mapping.child_product_id,
          quantity: mapping.quantity,
          sort_order: mapping.sort_order,
        })
        created++
      }
      logger.info(`[${parentTitle}] Created ${mappings.length} child mapping(s)`)
    } catch (error: any) {
      logger.error(`[${parentTitle}] Failed to create mappings: ${error.message}`)
    }
  }

  logger.info(`=== Bundle seeding complete: ${created} mapping(s) created across ${bundlesByParent.size} bundle(s) ===`)
}
