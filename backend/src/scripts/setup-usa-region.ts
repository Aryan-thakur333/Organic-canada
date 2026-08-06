import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  createTaxRegionsWorkflow,
  createShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"

interface ShippingOptionWithPrices {
  prices?: Array<{ amount: number; currency_code: string }>
}

export default async function setupUsaRegion({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const regionModuleService = container.resolve(Modules.REGION)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const successfulSections: string[] = []
  const unavailableSections: string[] = []
  const errors: any[] = []

  logger.info("[USA_REGION_SETUP_START]")

  // --- Task 8 Helper Section Wrapper ---
  async function runSection(
    sectionName: string,
    fn: () => Promise<void>
  ): Promise<void> {
    try {
      await fn()
      successfulSections.push(sectionName)
    } catch (error: any) {
      logger.info(`\n[USA_REGION_SECTION_UNAVAILABLE]`)
      logger.info(
        JSON.stringify(
          {
            section: sectionName,
            errorName: error?.name || "Error",
            errorMessage: error?.message || String(error),
          },
          null,
          2
        )
      )
      unavailableSections.push(sectionName)
      errors.push({
        section: sectionName,
        errorName: error?.name || "Error",
        errorMessage: error?.message || String(error),
      })
    }
  }

  // --- Core USA Region Section ---
  let usaRegion: any = null
  await runSection("Region", async () => {
    // Lookup existing regions using Query Graph
    const existingRegions = await query.graph({
      entity: "region",
      fields: ["id", "name", "currency_code", "countries.iso_2"],
    }).then(res => res.data || [])

    logger.info("[USA_REGION_EXISTING_STATE]")
    logger.info(`Found ${existingRegions.length} existing region(s) via Query Graph:`)
    for (const r of existingRegions) {
      const countriesList = (r.countries || []).map((c: any) => c.iso_2).join(", ")
      logger.info(
        `- Region: ${r.name} (${r.id}), Currency: ${r.currency_code}, Countries: [${countriesList}]`
      )
    }

    // Look for USA/USD region
    usaRegion = existingRegions.find(
      (r: any) =>
        r.currency_code?.toLowerCase() === "usd" ||
        r.name?.toLowerCase() === "usa" ||
        r.name?.toLowerCase() === "united states" ||
        r.countries?.some((c: any) => c.iso_2?.toLowerCase() === "us")
    )

    // Determine available payment providers in the system
    const { data: dbProviders } = await query.graph({
      entity: "payment_provider",
      fields: ["id", "is_enabled"],
    }).catch(() => ({ data: [] }))
    const storedProviderIds = dbProviders.map((p: any) => p.id)

    const desiredProviderIds = ["pp_system_default"]
    if (process.env.STRIPE_API_KEY) desiredProviderIds.push("pp_stripe_stripe")
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
      desiredProviderIds.push("pp_paypal_paypal")
    }

    const paymentProvidersList = desiredProviderIds.filter(id => storedProviderIds.includes(id))

    if (!usaRegion) {
      logger.info("[USA_REGION_CREATE]")
      logger.info("Creating USA region via workflow...")
      const { result } = await createRegionsWorkflow(container).run({
        input: {
          regions: [
            {
              name: "USA",
              currency_code: "usd",
              countries: ["us"],
              payment_providers: paymentProvidersList,
            },
          ],
        },
      })
      usaRegion = result[0]
      logger.info(`Created USA region: ${usaRegion.id}`)
    } else {
      logger.info(`USA region already exists: ${usaRegion.id}`)
    }
  })

  // Core region failure stops execution
  if (!usaRegion) {
    logger.error("Core USA Region could not be verified or created. Stopping script.")
    logger.info("[USA_REGION_SETUP_DONE]")
    logger.info(
      JSON.stringify(
        {
          regionId: null,
          status: "NOT_CONFIGURED",
          successfulSections,
          unavailableSections,
          errors,
        },
        null,
        2
      )
    )
    return
  }

  // --- Payment Providers Section ---
  await runSection("Payment Providers", async () => {
    logger.info("[USA_REGION_PAYMENT_PROVIDERS]")

    const { data: dbProviders } = await query.graph({
      entity: "payment_provider",
      fields: ["id", "is_enabled"],
    }).catch(() => ({ data: [] }))
    const storedProviderIds = dbProviders.map((p: any) => p.id)

    const desiredProviderIds = ["pp_system_default"]
    if (process.env.STRIPE_API_KEY) desiredProviderIds.push("pp_stripe_stripe")
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
      desiredProviderIds.push("pp_paypal_paypal")
    }

    const paymentProvidersList = desiredProviderIds.filter(id => storedProviderIds.includes(id))

    const { data: updatedUsaRegions } = await query.graph({
      entity: "region",
      fields: ["id", "payment_providers.id"],
      filters: { id: usaRegion.id },
    })
    const currentUsaRegion = updatedUsaRegions?.[0]
    const linkedProviderIds = (currentUsaRegion?.payment_providers || []).map((p: any) => p.id)

    const newlyLinked: string[] = []
    const skipped: string[] = []

    for (const providerId of paymentProvidersList) {
      if (linkedProviderIds.includes(providerId)) {
        logger.info(`Payment provider ${providerId} is already linked to USA region.`)
        continue
      }

      logger.info(`Linking payment provider ${providerId} to USA region...`)
      await link.create({
        [Modules.REGION]: {
          region_id: usaRegion.id,
        },
        [Modules.PAYMENT]: {
          payment_provider_id: providerId,
        },
      })
      newlyLinked.push(providerId)
    }

    for (const providerId of desiredProviderIds) {
      if (!paymentProvidersList.includes(providerId)) {
        skipped.push(providerId)
      }
    }

    logger.info(
      JSON.stringify(
        {
          regionId: usaRegion.id,
          requestedProviders: desiredProviderIds,
          availableProviders: paymentProvidersList,
          linkedProviders: [...linkedProviderIds, ...newlyLinked],
          skippedProviders: skipped,
        },
        null,
        2
      )
    )
  })

  // --- Tax Section ---
  await runSection("Tax", async () => {
    logger.info("[USA_REGION_TAX]")
    const taxModuleService = container.resolve(Modules.TAX)
    const existingTaxRegions = await taxModuleService.listTaxRegions({ country_code: "us" })
    if (existingTaxRegions.length === 0) {
      logger.info("Creating USA Tax Region...")
      await createTaxRegionsWorkflow(container).run({
        input: [
          {
            country_code: "us",
            provider_id: "tp_system",
          },
        ],
      })
      logger.info("USA Tax Region created successfully.")
    } else {
      logger.info(`USA Tax Region already exists: ${existingTaxRegions[0].id}`)
    }
  })

  // --- Fulfillment Section ---
  let serviceZoneId = ""
  let fulfillmentSetId = ""
  let defaultStockLocation: any = null

  await runSection("Fulfillment", async () => {
    logger.info("[USA_REGION_FULFILLMENT]")

    const stockLocations = await stockLocationService.listStockLocations(
      {},
      { take: 100, relations: ["address"] }
    )
    defaultStockLocation = stockLocations.find(
      (location) => location.address?.country_code?.toLowerCase() === "us"
    )
    if (!defaultStockLocation) {
      throw new Error(
        "No USA stock location found. Refusing to attach USA fulfillment to a non-USA location."
      )
    }

    // Ensure default stock location is linked to fulfillment manual provider
    try {
      await link.create({
        [Modules.STOCK_LOCATION]: {
          stock_location_id: defaultStockLocation.id,
        },
        [Modules.FULFILLMENT]: {
          fulfillment_provider_id: "manual_manual",
        },
      })
    } catch (e) {}

    // Query fulfillment sets linked to stock location
    const sets = await fulfillmentModuleService.listFulfillmentSets(
      {},
      { relations: ["service_zones", "service_zones.geo_zones"] }
    )

    let usFulfillmentSet = sets.find(
      (set: any) =>
        set.type === "shipping" &&
        set.service_zones?.some((zone: any) =>
          zone.geo_zones?.some((geo: any) => geo.country_code?.toLowerCase() === "us")
        )
    )

    if (!usFulfillmentSet) {
      logger.info("Creating USA Fulfillment Set and Service Zone...")
      usFulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
        name: "USA Warehouse delivery",
        type: "shipping",
        service_zones: [
          {
            name: "USA",
            geo_zones: [
              {
                country_code: "us",
                type: "country",
              },
            ],
          },
        ],
      })
      logger.info(`Created USA Fulfillment Set: ${usFulfillmentSet.id}`)
    } else {
      logger.info(`USA Fulfillment Set already exists: ${usFulfillmentSet.id}`)
    }

    fulfillmentSetId = usFulfillmentSet.id

    // Link fulfillment set to stock location
    try {
      await link.create({
        [Modules.STOCK_LOCATION]: {
          stock_location_id: defaultStockLocation.id,
        },
        [Modules.FULFILLMENT]: {
          fulfillment_set_id: usFulfillmentSet.id,
        },
      })
    } catch (e) {}

    const serviceZone = usFulfillmentSet.service_zones.find((zone: any) => zone.name === "USA")
    if (!serviceZone) {
      throw new Error("USA Service Zone not found in fulfillment set.")
    }

    serviceZoneId = serviceZone.id
    logger.info(`USA Service Zone ID: ${serviceZoneId}`)
  })

  // --- Shipping Options Section ---
  const shippingOptionIds: string[] = []

  await runSection("Shipping Options", async () => {
    logger.info("[USA_REGION_SHIPPING]")

    if (!serviceZoneId) {
      throw new Error("Cannot configure shipping options: USA Service Zone ID missing")
    }

    // Determine the project's price amount convention from existing Canada options
    const { data: canadaOptions } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "prices.amount", "prices.currency_code"],
      filters: { name: "Standard Shipping" },
    })

    const sampleCanadaOption = canadaOptions?.[0] as (typeof canadaOptions)[number] & ShippingOptionWithPrices | undefined
    const samplePrice = sampleCanadaOption?.prices?.find((p) => p.currency_code === "cad")?.amount ?? 1000
    
    // If Canada uses 10 (major units), we use 15 & 25. If Canada uses 1000 (minor units), we use 1500 & 2500.
    const isMinorUnits = samplePrice >= 100
    const standardAmount = isMinorUnits ? 1500 : 15
    const expressAmount = isMinorUnits ? 2500 : 25

    logger.info(`Detected price convention: sample price for Standard Shipping is ${samplePrice}.`)
    logger.info(`Using standard amount: ${standardAmount}, express amount: ${expressAmount} for USA shipping options.`)

    const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
      type: "default",
    })
    const shippingProfile = shippingProfiles[0]
    if (!shippingProfile) {
      throw new Error("No default shipping profile found.")
    }

    // Task 3: Load existing options safely using direct fields only (no relations)
    const existingOptions = await fulfillmentModuleService.listShippingOptions(
      { service_zone: { id: serviceZoneId } }
    )

    const existingStandard = existingOptions.find((opt: any) => opt.name === "USA Standard Shipping")
    const existingExpress = existingOptions.find((opt: any) => opt.name === "USA Express Shipping")

    if (!existingStandard) {
      logger.info("[USA_REGION_SHIPPING_OPTION] Creating USA Standard Shipping...")
      const { result } = await createShippingOptionsWorkflow(container).run({
        input: [
          {
            name: "USA Standard Shipping",
            price_type: "flat",
            provider_id: "manual_manual",
            service_zone_id: serviceZoneId,
            shipping_profile_id: shippingProfile.id,
            type: {
              label: "Standard",
              description: "Standard delivery in USA",
              code: "usa-standard",
            },
            prices: [
              {
                currency_code: "usd",
                amount: standardAmount,
              },
              {
                region_id: usaRegion.id,
                amount: standardAmount,
              },
            ],
            rules: [
              { attribute: "enabled_in_store", operator: "eq", value: "true" },
              { attribute: "is_return", operator: "eq", value: "false" },
            ],
          },
        ],
      })
      const createdOpt = result[0]
      shippingOptionIds.push(createdOpt.id)
      logger.info(
        JSON.stringify(
          {
            name: "USA Standard Shipping",
            status: "CREATED",
            shippingOptionId: createdOpt.id,
            serviceZoneId,
            currencyCode: "usd",
            amount: standardAmount,
          },
          null,
          2
        )
      )
    } else {
      shippingOptionIds.push(existingStandard.id)
      logger.info(
        JSON.stringify(
          {
            name: "USA Standard Shipping",
            status: "REUSED",
            shippingOptionId: existingStandard.id,
            serviceZoneId,
            currencyCode: "usd",
            amount: standardAmount,
          },
          null,
          2
        )
      )
    }

    if (!existingExpress) {
      logger.info("[USA_REGION_SHIPPING_OPTION] Creating USA Express Shipping...")
      const { result } = await createShippingOptionsWorkflow(container).run({
        input: [
          {
            name: "USA Express Shipping",
            price_type: "flat",
            provider_id: "manual_manual",
            service_zone_id: serviceZoneId,
            shipping_profile_id: shippingProfile.id,
            type: {
              label: "Express",
              description: "Express delivery in USA",
              code: "usa-express",
            },
            prices: [
              {
                currency_code: "usd",
                amount: expressAmount,
              },
              {
                region_id: usaRegion.id,
                amount: expressAmount,
              },
            ],
            rules: [
              { attribute: "enabled_in_store", operator: "eq", value: "true" },
              { attribute: "is_return", operator: "eq", value: "false" },
            ],
          },
        ],
      })
      const createdOpt = result[0]
      shippingOptionIds.push(createdOpt.id)
      logger.info(
        JSON.stringify(
          {
            name: "USA Express Shipping",
            status: "CREATED",
            shippingOptionId: createdOpt.id,
            serviceZoneId,
            currencyCode: "usd",
            amount: expressAmount,
          },
          null,
          2
        )
      )
    } else {
      shippingOptionIds.push(existingExpress.id)
      logger.info(
        JSON.stringify(
          {
            name: "USA Express Shipping",
            status: "REUSED",
            shippingOptionId: existingExpress.id,
            serviceZoneId,
            currencyCode: "usd",
            amount: expressAmount,
          },
          null,
          2
        )
      )
    }
  })

  // --- Final Verification Query via Query Graph ---
  logger.info("[USA_REGION_SETUP_DONE]")
  const finalRegions = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2", "payment_providers.id"],
    filters: { id: usaRegion.id },
  }).then(res => res.data || []).catch(() => [])

  const finalUsa = finalRegions[0] || {}
  const paymentProviderIds = (finalUsa.payment_providers || []).map((p: any) => p.id)
  const countryCodes = (finalUsa.countries || []).map((c: any) => c.iso_2)

  logger.info(
    JSON.stringify(
      {
        regionId: usaRegion.id,
        currencyCode: usaRegion.currency_code,
        countryCodes,
        paymentProviderIds,
        fulfillmentSetId,
        serviceZoneId,
        shippingOptionIds,
        status: "PARTIALLY_CONFIGURED",
        successfulSections,
        unavailableSections,
        errors,
      },
      null,
      2
    )
  )
}
