import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

type QueryGraph = {
  graph(input: Record<string, unknown>): Promise<{
    data: Array<{
      id: string
      sku?: string | null
      manage_inventory?: boolean
      inventory_items?: Array<{
        inventory_item_id?: string
        inventory?: {
          location_levels?: Array<{
            id: string
            location_id: string
            stocked_quantity: number
            reserved_quantity: number
          }>
        } | null
      }>
    }>
  }>
}

type ErpService = {
  getOptions(): {
    inventorySyncEnabled: boolean
    inventoryDryRun: boolean
  }
  getClient(): {
    executeKeyword<T>(
      model: string,
      method: string,
      args: unknown[],
      kwargs?: Record<string, unknown>
    ): Promise<T>
  }
  assertOdooProductInventoryTrackable(
    productId: number
  ): Promise<{
    productId: number
    templateId: number
    sku: string
    productType: string
    templateType: string
    isStorable: boolean
    tracking: string
    inventoryTrackable: boolean
  }>
}

function errorCode(error: unknown) {
  return error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "ERP_INVENTORY_WRITE_FAILED"
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const erpService = req.scope.resolve<ErpService>("erp")
  const cachedOptions = erpService.getOptions()

  const envSyncEnabled = process.env.ERP_INVENTORY_SYNC_ENABLED === "true"
  const envDryRun = process.env.ERP_INVENTORY_DRY_RUN !== "false"

  const syncEnabled = cachedOptions.inventorySyncEnabled
  const dryRunMode = cachedOptions.inventoryDryRun

  const dryRun = !syncEnabled || dryRunMode

  type InventorySyncBody = {
    sku?: unknown
    confirmWrite?: unknown
    confirmInventoryWrite?: unknown
  }
  const body = (req.body || {}) as InventorySyncBody
  const confirmInventoryWrite = body.confirmWrite === true || body.confirmInventoryWrite === true

  const effectiveWriteAllowed = syncEnabled && !dryRunMode && confirmInventoryWrite

  console.info(`[ERP_INVENTORY_RUNTIME_CONFIG] ${JSON.stringify({
    syncEnabled,
    dryRun,
    confirmInventoryWrite,
    effectiveWriteAllowed,
    envValues: {
      ERP_INVENTORY_SYNC_ENABLED: envSyncEnabled,
      ERP_INVENTORY_DRY_RUN: envDryRun
    },
    cachedOptions: {
      inventorySyncEnabled: cachedOptions.inventorySyncEnabled,
      inventoryDryRun: cachedOptions.inventoryDryRun
    }
  })}`)

  console.info(`[ERP_INVENTORY_REQUEST_DEBUG] ${JSON.stringify({
    bodyPresent: Boolean(req.body),
    bodyKeys: Object.keys(req.body || {}),
    skuType: typeof body?.sku,
    skuValue: body?.sku
  })}`)

  const skuRaw = body.sku
  const isSingleString = typeof skuRaw === "string"
  const sku = isSingleString ? skuRaw.trim() : ""

  if (!isSingleString || !sku) {
    return res.status(400).json({
      success: false,
      dryRun,
      error: {
        code: "ERP_INVENTORY_EXACT_SKU_REQUIRED",
        message: "Inventory sync requires one exact SKU.",
      },
    })
  }

  const skuPrefix = "ERP-"
  if (!sku.startsWith(skuPrefix)) {
    return res.status(422).json({
      success: false,
      dryRun,
      error: {
        code: "ERP_PRODUCT_FILTER_INVALID",
        message: `SKU must start with prefix ${skuPrefix}`,
      },
    })
  }

  try {
    console.info(
      `[ERP_INVENTORY_SYNC_START] provider=odoo direction=medusa_to_odoo sku=${sku}`
    )

    const query = req.scope.resolve<QueryGraph>(
      ContainerRegistrationKeys.QUERY
    )

    // 1. Verify Medusa stock location configuration
    const targetLocationId = process.env.ERP_MEDUSA_STOCK_LOCATION_ID?.trim()
    if (!targetLocationId) {
      return res.status(409).json({
        success: false,
        dryRun: true,
        error: {
          code: "ERP_INVENTORY_LOCATION_NOT_MAPPED",
          message: "ERP_MEDUSA_STOCK_LOCATION_ID must select one existing Medusa stock location.",
        },
      })
    }

    // 2. Validate Odoo Location
    const odooLocationId = Number(process.env.ERP_ODOO_LOCATION_ID || 8)
    const locations = await erpService.getClient().executeKeyword<any[]>(
      "stock.location",
      "read",
      [[odooLocationId]],
      { fields: ["id", "complete_name", "usage"] }
    )

    if (!locations || locations.length === 0) {
      return res.status(409).json({
        success: false,
        dryRun: true,
        error: {
          code: "ERP_ODOO_LOCATION_INVALID",
          message: `Odoo location ID ${odooLocationId} not found.`,
        },
      })
    }

    const odooLocation = locations[0]
    if (odooLocation.usage !== "internal") {
      return res.status(409).json({
        success: false,
        dryRun: true,
        error: {
          code: "ERP_ODOO_LOCATION_INVALID",
          message: `Odoo location ID ${odooLocationId} usage is '${odooLocation.usage}', but must be 'internal'.`,
        },
      })
    }

    // 3. Resolve Odoo Product
    const odooProducts = await erpService.getClient().executeKeyword<any[]>(
      "product.product",
      "search_read",
      [[["default_code", "=", sku]]],
      { fields: ["id", "default_code"], limit: 10 }
    )

    if (!odooProducts || odooProducts.length === 0) {
      return res.status(404).json({
        success: false,
        dryRun: true,
        error: {
          code: "ERP_ODOO_PRODUCT_NOT_FOUND",
          message: `No Odoo product found for SKU ${sku}.`,
        },
      })
    }

    if (odooProducts.length > 1) {
      return res.status(409).json({
        success: false,
        dryRun: true,
        error: {
          code: "ERP_ODOO_SKU_AMBIGUOUS",
          message: `Multiple Odoo products use SKU ${sku}.`,
        },
      })
    }

    const odooProductId = odooProducts[0].id

    // 4. Preflight: verify the Odoo product is inventory-trackable
    //    before any stock.quant operations are attempted.
    let inventoryCapability: Awaited<
      ReturnType<ErpService["assertOdooProductInventoryTrackable"]>
    >
    try {
      inventoryCapability =
        await erpService.assertOdooProductInventoryTrackable(odooProductId)
    } catch (error) {
      const code =
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "ERP_ODOO_PRODUCT_NOT_STORABLE"

      if (code === "ERP_ODOO_PRODUCT_NOT_STORABLE") {
        return res.status(422).json({
          success: false,
          dryRun: true,
          error: {
            code: "ERP_ODOO_PRODUCT_NOT_STORABLE",
            message:
              error instanceof Error
                ? error.message
                : `Odoo product ${odooProductId} is not inventory-trackable.`,
            details: {
              productId: odooProductId,
              sku,
            },
          },
        })
      }

      throw error
    }

    // 6. Read Odoo Stock at location
    const quants = await erpService.getClient().executeKeyword<any[]>(
      "stock.quant",
      "search_read",
      [[
        ["product_id", "=", odooProductId],
        ["location_id", "=", odooLocationId]
      ]],
      { fields: ["id", "quantity", "reserved_quantity"], limit: 1 }
    )

    const quantMatch = quants && quants.length > 0 ? quants[0] : null
    const odooQuantity = quantMatch ? Number(quantMatch.quantity) : 0

    // 7. Query Medusa Variant inventory level
    const { data: variants } = await query.graph({
      entity: "variant",
      fields: [
        "id",
        "sku",
        "manage_inventory",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
        "inventory_items.inventory.location_levels.reserved_quantity",
      ],
      filters: { sku: [sku] },
    })

    if (!variants.length) {
      return res.status(404).json({
        success: false,
        dryRun: true,
        error: {
          code: "ERP_INVENTORY_SKU_NOT_FOUND",
          message: "No Medusa variant matches the exact ERP SKU.",
        },
      })
    }

    if (variants.length > 1) {
      return res.status(409).json({
        success: false,
        dryRun: true,
        error: {
          code: "ERP_INVENTORY_DUPLICATE_SKU",
          message: "Multiple Medusa variants match the exact ERP SKU.",
        },
      })
    }

    const variant = variants[0]
    const inventoryItem = variant.inventory_items?.[0]

    if (!variant.manage_inventory || !inventoryItem?.inventory_item_id) {
      return res.status(409).json({
        success: false,
        dryRun: true,
        error: {
          code: "ERP_INVENTORY_ITEM_NOT_FOUND",
          message: "The Medusa variant is not inventory-managed and has no inventory item.",
        },
      })
    }

    const level = inventoryItem.inventory?.location_levels?.find(
      (candidate) => candidate.location_id === targetLocationId
    )

    if (!level) {
      return res.status(409).json({
        success: false,
        dryRun: true,
        error: {
          code: "ERP_INVENTORY_LOCATION_NOT_MAPPED",
          message: "The Medusa inventory item has no level at the configured stock location.",
        },
      })
    }

    const medusaStockedQuantity = Number(level.stocked_quantity)
    const medusaReservedQuantity = Number(level.reserved_quantity)
    const targetQuantity = medusaStockedQuantity // Medusa is source of truth, stocked (on-hand) quantity
    const delta = targetQuantity - odooQuantity

    const action = odooQuantity === targetQuantity ? "SKIP" : "UPDATE"
    const reason = action === "SKIP" ? "NO_CHANGES" : "QUANTITY_MISMATCH"

    const confirm = body.confirmWrite === true || body.confirmInventoryWrite === true
    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        dryRun: false,
        error: {
          code: "ERP_INVENTORY_WRITE_CONFIRMATION_REQUIRED",
          message: "Set confirmInventoryWrite to true for the exact SKU inventory write.",
        },
      })
    }

    if (!dryRun && action === "UPDATE") {
      const client = erpService.getClient()
      if (quantMatch) {
        // Write inventory_quantity and apply
        await client.executeKeyword("stock.quant", "write", [[quantMatch.id], { inventory_quantity: targetQuantity }])
        await client.executeKeyword("stock.quant", "action_apply_inventory", [[quantMatch.id]])
      } else {
        // Create new quant and apply
        const newQuantId = await client.executeKeyword<number>("stock.quant", "create", [{
          product_id: odooProductId,
          location_id: odooLocationId,
          inventory_quantity: targetQuantity
        }])
        await client.executeKeyword("stock.quant", "action_apply_inventory", [[newQuantId]])
      }
    }

    const summary = {
      itemsRead: 1,
      wouldUpdate: action === "UPDATE" ? 1 : 0,
      unchanged: action === "SKIP" ? 1 : 0,
      errors: 0
    }

    const item = {
      sku,
      medusaVariantId: variant.id,
      odooProductId,
      medusaStockLocationId: targetLocationId,
      odooLocationId,
      medusaStockedQuantity,
      medusaReservedQuantity,
      odooQuantity,
      targetQuantity,
      delta,
      action,
      reason
    }

    return res.status(200).json({
      success: true,
      dryRun,
      summary,
      items: [item]
    })

  } catch (error) {
    const code = errorCode(error)
    console.warn(
      `[ERP_INVENTORY_SYNC_FAILED] provider=odoo sku=${sku} code=${code}`
    )

    return res.status(502).json({
      success: false,
      dryRun: true,
      error: {
        code,
        message:
          error instanceof Error
            ? error.message
            : "Unknown ERP inventory error",
      },
    })
  }
}
