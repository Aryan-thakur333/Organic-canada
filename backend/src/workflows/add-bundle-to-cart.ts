import { createWorkflow, createStep, transform, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle"
import { loadBundleOperationalContext } from "../modules/bundle/utils/availability"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { allocateBundlePriceMinor } from "../modules/bundle/utils/price-allocation"
import { getBundleGroupId } from "../modules/bundle/utils/group-id"
import { majorToMinor, minorToMajor } from "../modules/bundle/utils/money"

// ─── Types ────────────────────────────────────────────────────────────────────

export type AddBundleToCartInput = {
  cart_id: string
  bundle_id: string
  quantity: number
}

// ─── Step 1: Validate input ───────────────────────────────────────────────────

const validateBundleCartInput = createStep(
  "validate-bundle-cart-input",
  async (input: AddBundleToCartInput) => {
    if (!input.cart_id || typeof input.cart_id !== "string") {
      throw new Error("cart_id is required")
    }
    if (!input.bundle_id || typeof input.bundle_id !== "string") {
      throw new Error("bundle_id is required")
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) {
      throw new Error("quantity must be an integer between 1 and 100")
    }
    return new StepResponse(input)
  }
)

// ─── Step 2: Load cart and region context ─────────────────────────────────────

const loadCartContext = createStep(
  "load-bundle-cart-context",
  async ({ cart_id }: { cart_id: string }, { container }) => {
    const cartService: any = container.resolve(Modules.CART)
    const cart = await cartService.retrieveCart(cart_id, { relations: ["items"] })
    if (!cart) throw new Error("Cart not found")
    if (cart.completed_at) throw new Error("Cart is already completed")

    const regionService: any = container.resolve(Modules.REGION)
    const region = await regionService.retrieveRegion(cart.region_id, { relations: ["countries"] })

    return new StepResponse({
      cart,
      region,
      regionId: cart.region_id,
      currencyCode: String(cart.currency_code || region?.currency_code || "").toLowerCase(),
      salesChannelId: cart.sales_channel_id || "",
      allowedCountryCodes: (region?.countries || []).map((c: any) => String(c.iso_2 || "").toLowerCase()),
    })
  }
)

// ─── Step 3: Load bundle and validate against cart context ────────────────────

const loadAndValidateBundle = createStep(
  "load-validate-bundle",
  async (
    input: {
      bundle_id: string
      quantity: number
      cartContext: {
        cart: any
        region: any
        regionId: string
        currencyCode: string
        salesChannelId: string
        allowedCountryCodes: string[]
      }
    },
    { container }
  ) => {
    const { bundle_id, quantity, cartContext } = input
    const bundleService: any = container.resolve(BUNDLE_MODULE)

    const bundle = await bundleService.retrieveBundleDefinition(bundle_id)
    if (!bundle) throw new Error("Bundle not found")
    if (bundle.status !== "active") throw new Error("Bundle is not active")

    // Sales channel check
    if (Array.isArray(bundle.sales_channel_ids) && bundle.sales_channel_ids.length > 0) {
      if (!bundle.sales_channel_ids.includes(cartContext.salesChannelId)) {
        throw new Error("Bundle is not available in this sales channel")
      }
    }

    // Determine country code for location resolution
    // Use cart shipping address country if available, else first region country
    const shippingCountry = String(cartContext.cart.shipping_address?.country_code || "").toLowerCase()
    const countryCode = cartContext.allowedCountryCodes.includes(shippingCountry)
      ? shippingCountry
      : cartContext.allowedCountryCodes[0] || ""

    if (!countryCode) {
      throw new Error("Unable to determine regional country code for inventory resolution")
    }

    return new StepResponse({ bundle, countryCode })
  }
)

// ─── Step 4: Retrieve authoritative regional price ────────────────────────────

const resolveBundlePrice = createStep(
  "resolve-bundle-price",
  async (
    input: { bundle: any; regionId: string; currencyCode: string },
    { container }
  ) => {
    const { bundle, regionId, currencyCode } = input
    const query: any = container.resolve("query")

    let bundlePriceMajor: number | null = null
    let priceCurrency: string | null = null

    try {
      const { QueryContext } = await import("@medusajs/framework/utils")
      const { data: variants } = await query.graph({
        entity: "variant",
        fields: ["id", "calculated_price.*", "prices.amount", "prices.currency_code"],
        filters: { id: bundle.variant_id },
        context: { calculated_price: QueryContext({ region_id: regionId, currency_code: currencyCode }) },
        pagination: { take: 1 },
      })
      const variant = variants[0]
      if (variant?.calculated_price?.calculated_amount !== undefined && variant.calculated_price?.calculated_amount !== null) {
        bundlePriceMajor = Number(variant.calculated_price.calculated_amount)
        priceCurrency = String(variant.calculated_price.currency_code || "").toLowerCase()
      } else if (variant?.prices?.length) {
        const match = (variant.prices || []).find(
          (p: any) => String(p.currency_code || "").toLowerCase() === currencyCode
        )
        if (match) {
          bundlePriceMajor = Number(match.amount)
          priceCurrency = currencyCode
        }
      }
    } catch (error: any) {
      throw new Error(`Failed to resolve bundle price: ${error.message}`)
    }

    if (bundlePriceMajor === null) {
      throw new Error(`No regional price found for bundle in currency ${currencyCode.toUpperCase()}`)
    }

    if (priceCurrency !== currencyCode) {
      throw new Error(`Bundle price currency ${priceCurrency} does not match cart currency ${currencyCode}`)
    }
    const bundlePriceMinor = majorToMinor(bundlePriceMajor, priceCurrency)

    return new StepResponse({ bundlePriceMajor, bundlePriceMinor, currency: priceCurrency })
  }
)

// ─── Step 5: Load components and validate inventory ───────────────────────────

const loadComponentsAndValidateInventory = createStep(
  "load-validate-bundle-components",
  async (
    input: {
      bundle: any
      quantity: number
      salesChannelId: string
      countryCode: string
    },
    { container }
  ) => {
    const { bundle, quantity, salesChannelId, countryCode } = input

    const operational = await loadBundleOperationalContext(container as any, bundle, quantity, {
      sales_channel_id: salesChannelId,
      country_code: countryCode,
    })

    if (!operational.can_fulfill) {
      // Find the limiting component for detailed error
      throw Object.assign(
        new Error(
          `Insufficient inventory: only ${operational.available_quantity} bundle unit(s) available at the regional location`
        ),
        {
          code: "BUNDLE_COMPONENT_INSUFFICIENT_INVENTORY",
          available_quantity: operational.available_quantity,
          required_quantity: quantity,
        }
      )
    }

    return new StepResponse(operational)
  }
)

// ─── Step 6: Add component lines to cart ─────────────────────────────────────

const addBundleComponentLinesToCart = createStep(
  "add-bundle-component-lines",
  async (
    input: {
      cart_id: string
      bundle: any
      bundle_group_id: string
      quantity: number
      bundlePriceMinor: number
      bundlePriceMajor: number
      expectedTotalMinor: number
      bundleCurrency: string
      operational: any
      countryCode: string
    },
    { container }
  ) => {
    const { cart_id, bundle, bundle_group_id, quantity, bundlePriceMinor, bundlePriceMajor, expectedTotalMinor, bundleCurrency, operational } = input

    const components = operational.components as Array<{
      id: string
      quantity: number
      title: string
      sku: string
      product: { id: string; title: string }
    }>

    if (!Number.isSafeInteger(expectedTotalMinor) || expectedTotalMinor <= 0) throw new Error("BUNDLE_PRICE_MINOR_INVALID")
    if (process.env.NODE_ENV === "development") {
      console.log("[BUNDLE_PRICE_ALLOCATION_INPUT]", JSON.stringify({
        currencyCode: bundleCurrency,
        configuredMajorAmount: bundlePriceMajor,
        convertedMinorAmount: bundlePriceMinor,
        quantity,
        expectedTotalMinor,
        isPositiveInteger: Number.isSafeInteger(expectedTotalMinor) && expectedTotalMinor > 0,
      }))
    }
    const allocations = allocateBundlePriceMinor(expectedTotalMinor, components, quantity)
    const allocatedTotalMinor = allocations.reduce((total, allocation) => total + allocation.unit_price * allocation.quantity, 0)
    if (allocatedTotalMinor !== expectedTotalMinor) throw new Error("BUNDLE_PRICE_ALLOCATION_MISMATCH")
    if (process.env.NODE_ENV === "development") {
      console.log("[BUNDLE_ALLOCATION_RECONCILIATION]", JSON.stringify({
        expectedTotalMinor,
        allocatedTotalMinor,
        passed: allocatedTotalMinor === expectedTotalMinor,
      }))
    }
    const lineItems = allocations.map((allocation) => ({
      variant_id: allocation.id,
      quantity: allocation.quantity,
      unit_price: allocation.unit_price,
      metadata: {
        commerce_type: "FIXED_BUNDLE_COMPONENT",
        bundle_id: bundle.id,
        bundle_group_id,
        bundle_title: bundle.title,
        bundle_quantity: quantity,
        component_quantity_per_bundle: allocation.component_quantity_per_bundle,
        component_sku: allocation.sku,
        component_product_title: allocation.product?.title || "",
        bundle_allocation_index: allocation.allocation_index,
        allocated_bundle_price_minor: allocation.allocated_bundle_price_minor,
        // Major-unit alias retained for current cart presentation compatibility.
        allocated_bundle_price: allocation.allocated_bundle_price_minor === 0
          ? 0
          : minorToMajor(allocation.allocated_bundle_price_minor, bundleCurrency),
        bundle_currency: bundleCurrency,
        bundle_price_major: bundlePriceMajor,
        bundle_price_minor: bundlePriceMinor,
        bundle_price_unit: "minor",
      },
    }))

    // Add all component lines atomically via addToCartWorkflow
    let addedLineIds: string[] = []
    try {
      await addToCartWorkflow(container as any).run({
        input: {
          cart_id,
          items: lineItems,
        },
      })

      // Retrieve added lines by bundle_group_id
      const cartService: any = container.resolve(Modules.CART)
      const updatedCart = await cartService.retrieveCart(cart_id, { relations: ["items"] })
      const bundleLines = (updatedCart.items || []).filter((item: any) => getBundleGroupId(item) === bundle_group_id)
      addedLineIds = bundleLines.map((line: any) => line.id)
      if (addedLineIds.length !== lineItems.length) {
        throw new Error("Bundle component lines could not be verified after adding to cart")
      }
    } catch (error: any) {
      throw new Error(`Failed to add bundle component lines: ${error.message}`)
    }

    return new StepResponse(
      { addedLineIds, lineItems },
      // Compensation data: line IDs to remove on failure
      { cart_id, addedLineIds }
    )
  },
  // Compensation: remove added lines on downstream failure
  async ({ cart_id, addedLineIds }: { cart_id: string; addedLineIds: string[] }, { container }) => {
    if (!addedLineIds?.length) return
    try {
      const cartService: any = container.resolve(Modules.CART)
      for (const lineId of addedLineIds) {
        await cartService.deleteLineItems([lineId]).catch(() => undefined)
      }
    } catch { /* best effort cleanup */ }
  }
)

// ─── Step 7: Create bundle snapshot ──────────────────────────────────────────

const createBundleSnapshot = createStep(
  "create-bundle-snapshot",
  async (
    input: {
      cart_id: string
      bundle: any
      bundle_group_id: string
      quantity: number
      bundlePriceMajor: number
      bundlePriceMinor: number
      expectedTotalMinor: number
      bundleCurrency: string
      regionId: string
      components: any[]
      countryCode: string
      salesChannelId: string
      stockLocationId: string | null
    },
    { container }
  ) => {
    const bundleService: any = container.resolve(BUNDLE_MODULE)

    const componentSnapshot = {
      bundle_title: input.bundle.title,
      bundle_handle: input.bundle.handle,
      bundle_group_id: input.bundle_group_id,
      components: input.components.map((c: any) => ({
        variant_id: c.id,
        product_title: c.product?.title || "",
        variant_title: c.title || "",
        sku: c.sku || "",
        quantity_per_bundle: c.quantity,
        total_quantity: c.quantity * input.quantity,
      })),
    }

    const bundlePriceSnapshot = {
      unit_price: input.bundlePriceMinor,
      unit_price_major: input.bundlePriceMajor,
      unit_price_minor: input.bundlePriceMinor,
      currency_code: input.bundleCurrency,
      region_id: input.regionId,
      total_price: input.expectedTotalMinor,
      total_price_minor: input.expectedTotalMinor,
      total_price_major: minorToMajor(input.expectedTotalMinor, input.bundleCurrency),
    }

    const snapshot = await bundleService.createBundleLineSnapshots({
      cart_id: input.cart_id,
      bundle_group_id: input.bundle_group_id,
      status: "pending",
      cart_line_item_id: null,
      bundle_id: input.bundle.id,
      component_snapshot: componentSnapshot,
      bundle_price_snapshot: bundlePriceSnapshot,
      reservation_status: "none",
      metadata: {
        bundle_group_id: input.bundle_group_id,
        all_line_ids: [],
        sales_channel_id: input.salesChannelId,
        country_code: input.countryCode,
        stock_location_id: input.stockLocationId,
      },
    })

    return new StepResponse(snapshot, { snapshotId: snapshot.id, bundleService })
  },
  // Compensation: remove snapshot on downstream failure
  async ({ snapshotId, bundleService }: { snapshotId: string; bundleService: any }) => {
    try {
      await bundleService.deleteBundleLineSnapshots([snapshotId])
    } catch { /* best effort */ }
  }
)

/** Activates the pending snapshot only after every component line is verified. */
const activateBundleSnapshot = createStep(
  "activate-bundle-snapshot",
  async (
    input: { cart_id: string; bundle_group_id: string; snapshot: any; addedLineIds: string[]; expectedTotal: number },
    { container }
  ) => {
    const cartService: any = container.resolve(Modules.CART)
    const bundleService: any = container.resolve(BUNDLE_MODULE)
    const cart = await cartService.retrieveCart(input.cart_id, { relations: ["items"] })
    const lines = (cart.items || []).filter((line: any) => getBundleGroupId(line) === input.bundle_group_id)
    const verifiedIds = lines.map((line: any) => line.id).sort()
    const expectedIds = [...input.addedLineIds].sort()
    const lineTotal = lines.reduce((total: number, line: any) => total + Number(line.unit_price || 0) * Number(line.quantity || 0), 0)

    if (verifiedIds.length === 0 || verifiedIds.join(",") !== expectedIds.join(",") || lineTotal !== input.expectedTotal) {
      throw new Error("Bundle snapshot activation failed because cart component lines do not match the quoted bundle")
    }

    const updated = await bundleService.updateBundleLineSnapshots({
      id: input.snapshot.id,
      cart_line_item_id: verifiedIds[0],
      status: "active",
      metadata: { ...(input.snapshot.metadata || {}), all_line_ids: verifiedIds },
    })
    return new StepResponse(Array.isArray(updated) ? updated[0] : updated)
  }
)

// ─── Main workflow ────────────────────────────────────────────────────────────

export const addBundleToCartWorkflow = createWorkflow(
  "add-bundle-to-cart",
  function (input: AddBundleToCartInput) {
    // Step 1: Validate input
    const validatedInput = validateBundleCartInput(input)

    // Step 2: Load cart context
    const cartContext = loadCartContext({ cart_id: input.cart_id })

    // Step 3: Load and validate bundle
    const { bundle, countryCode } = loadAndValidateBundle({
      bundle_id: input.bundle_id,
      quantity: input.quantity,
      cartContext: cartContext as any,
    } as any)

    // Step 4: Resolve authoritative price
    const { bundlePriceMajor, bundlePriceMinor, currency: bundleCurrency } = resolveBundlePrice({
      bundle: bundle as any,
      regionId: (cartContext as any).regionId,
      currencyCode: (cartContext as any).currencyCode,
    } as any)

    // Step 5: Load components and validate inventory
    const operational = loadComponentsAndValidateInventory({
      bundle: bundle as any,
      quantity: input.quantity,
      salesChannelId: (cartContext as any).salesChannelId,
      countryCode: countryCode as any,
    } as any)

    // Generate bundle_group_id
    const bundle_group_id = `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const pricingInput = transform(
      { bundlePriceMinor, quantity: input.quantity },
      ({ bundlePriceMinor, quantity }) => {
        const expectedTotalMinor = Number(bundlePriceMinor) * Number(quantity)
        if (!Number.isSafeInteger(expectedTotalMinor) || expectedTotalMinor <= 0) {
          throw new Error("BUNDLE_PRICE_MINOR_INVALID")
        }
        return { expectedTotalMinor }
      }
    )

    // Create a pending snapshot first. If any later workflow step fails, its
    // compensation removes the snapshot and the component-line step removes
    // its lines, preventing the historical lines-without-snapshot state.
    const pendingSnapshot = createBundleSnapshot({
      cart_id: input.cart_id,
      bundle: bundle as any,
      bundle_group_id,
      quantity: input.quantity,
      bundlePriceMajor: bundlePriceMajor as any,
      bundlePriceMinor: bundlePriceMinor as any,
      expectedTotalMinor: (pricingInput as any).expectedTotalMinor,
      bundleCurrency: bundleCurrency as any,
      regionId: (cartContext as any).regionId,
      components: (operational as any).components,
      countryCode: countryCode as any,
      salesChannelId: (cartContext as any).salesChannelId,
      stockLocationId: (operational as any).selected_location?.location_id || null,
    } as any)

    // Add components only after pending snapshot creation.
    const { addedLineIds, lineItems } = addBundleComponentLinesToCart({
      cart_id: input.cart_id,
      bundle: bundle as any,
      bundle_group_id,
      quantity: input.quantity,
      bundlePriceMajor: bundlePriceMajor as any,
      bundlePriceMinor: bundlePriceMinor as any,
      expectedTotalMinor: (pricingInput as any).expectedTotalMinor,
      bundleCurrency: bundleCurrency as any,
      operational: operational as any,
      countryCode: countryCode as any,
    } as any)

    // Workflow values are Composer objects at definition time. Arithmetic must
    // execute through `transform` when the workflow runs, not in the composer.
    const snapshot = activateBundleSnapshot({
      cart_id: input.cart_id,
      bundle_group_id,
      snapshot: pendingSnapshot as any,
      addedLineIds: addedLineIds as any,
      expectedTotal: (pricingInput as any).expectedTotalMinor,
    } as any)

    return new WorkflowResponse({
      bundle_group_id,
      snapshot,
      component_count: (operational as any).components?.length || 0,
    })
  }
)
