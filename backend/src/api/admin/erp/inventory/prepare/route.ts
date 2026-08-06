import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"

import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

type Variant = {
  id: string
  sku?: string | null
  title?: string | null
  manage_inventory?: boolean
  product?: { id?: string; title?: string } | null
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
}

type Query = {
  graph(input: Record<string, unknown>): Promise<{
    data: Variant[]
  }>
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const sku =
    typeof req.query.sku === "string"
      ? req.query.sku.trim()
      : ""
  const body = req.body as {
    confirmPrepare?: unknown
    stockLocationId?: unknown
  } | undefined
  const configuredLocationId =
    process.env.ERP_MEDUSA_STOCK_LOCATION_ID?.trim()

  if (!sku) {
    return res.status(400).json({
      success: false,
      error: { code: "ERP_EXACT_SKU_REQUIRED", message: "Inventory preparation requires one exact SKU." },
    })
  }

  if (body?.confirmPrepare !== true) {
    return res.status(400).json({
      success: false,
      error: { code: "ERP_INVENTORY_PREPARE_CONFIRMATION_REQUIRED", message: "Set confirmPrepare to true to prepare inventory." },
    })
  }

  if (
    !configuredLocationId ||
    body.stockLocationId !== configuredLocationId
  ) {
    return res.status(400).json({
      success: false,
      error: { code: "ERP_INVENTORY_PREPARE_LOCATION_MISMATCH", message: "stockLocationId must match the explicitly configured ERP_MEDUSA_STOCK_LOCATION_ID." },
    })
  }

  try {
    const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
    const remoteLink: any = req.scope.resolve(ContainerRegistrationKeys.LINK)
    const { data: variants } = await query.graph({
      entity: "variant",
      fields: [
        "id", "sku", "title", "manage_inventory", "product.id", "product.title",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
        "inventory_items.inventory.location_levels.reserved_quantity",
      ],
      filters: { sku: [sku] },
    })

    if (!variants.length) {
      return res.status(404).json({ success: false, error: { code: "ERP_MEDUSA_SKU_NOT_FOUND", message: "No Medusa variant matches the exact ERP SKU." } })
    }
    if (variants.length > 1) {
      return res.status(409).json({ success: false, error: { code: "DUPLICATE_MEDUSA_SKU", message: "Multiple Medusa variants match the exact ERP SKU." } })
    }

    const variant = variants[0]
    let inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id
    let createdItem = false
    let linkedItem = false
    let createdLevel = false
    let enabledInventory = false

    if (!inventoryItemId) {
      const { result } = await createInventoryItemsWorkflow(req.scope).run({
        input: {
          items: [{
            sku,
            title: `${variant.product?.title || "ERP product"} - ${variant.title || "Default"}`,
          }],
        },
      })
      inventoryItemId = result[0].id
      createdItem = true

      await remoteLink.create({
        [Modules.PRODUCT]: { variant_id: variant.id },
        [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
      })
      linkedItem = true
    }

    if (!variant.manage_inventory) {
      await updateProductVariantsWorkflow(req.scope).run({
        input: {
          product_variants: [{
            id: variant.id,
            manage_inventory: true,
          }],
        },
      })
      enabledInventory = true
    }

    const inventoryService: any = req.scope.resolve(Modules.INVENTORY)
    const levels = await inventoryService.listInventoryLevels({
      inventory_item_id: inventoryItemId,
      location_id: configuredLocationId,
    })

    if (!levels.length) {
      await createInventoryLevelsWorkflow(req.scope).run({
        input: {
          inventory_levels: [{
            inventory_item_id: inventoryItemId,
            location_id: configuredLocationId,
            stocked_quantity: 0,
          }],
        },
      })
      createdLevel = true
    }

    const action =
      createdItem || linkedItem || enabledInventory || createdLevel
        ? "PREPARED"
        : "UNCHANGED"
    console.info(`[ERP_INVENTORY_PREPARE_${action}] sku=${sku} inventoryItemId=${inventoryItemId} locationId=${configuredLocationId}`)

    return res.status(200).json({
      success: true,
      sku,
      action,
      inventoryItemId,
      stockLocationId: configuredLocationId,
      createdItem,
      linkedItem,
      enabledInventory,
      createdLevel,
      initialStockedQuantity: 0,
    })
  } catch (error) {
    console.error(`[ERP_INVENTORY_PREPARE_FAILED] sku=${sku}`)
    return res.status(502).json({
      success: false,
      error: {
        code: "ERP_INVENTORY_PREPARE_FAILED",
        message: error instanceof Error ? error.message : "Inventory preparation failed.",
      },
    })
  }
}
