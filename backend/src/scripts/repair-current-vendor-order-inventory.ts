import type { ExecArgs } from "@medusajs/framework/types"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace/index.js"
import { resolveVendorOrderItemInventory } from "../utils/marketplace/resolve-vendor-order-item-inventory.js"

interface VendorOrderCandidate {
  id: string
  display_id?: string | number | null
  order_id: string
  vendor_id: string
  status: string
  metadata?: Record<string, unknown> | null
}

function parseArgs(args: string[] | undefined) {
  const combined = [
    ...(Array.isArray(args) ? args : []),
    ...process.argv
  ]

  let latestPrepared = false
  let listPrepared = false
  let vendorOrderId = ""
  let displayIdInput = ""
  let productTitle = ""
  let quantity: number | null = null
  let statusFilter = ""
  let stockedQuantity = 100

  for (let i = 0; i < combined.length; i++) {
    const arg = combined[i]
    if (arg === "--latest-prepared") {
      latestPrepared = true
    } else if (arg === "--list-prepared") {
      listPrepared = true
    } else if (arg.startsWith("--vendor-order-id=")) {
      vendorOrderId = arg.split("=")[1]
    } else if (arg === "--vendor-order-id" && i + 1 < combined.length) {
      vendorOrderId = combined[i + 1]
    } else if (arg.startsWith("--display-id=")) {
      displayIdInput = arg.split("=")[1]
    } else if (arg === "--display-id" && i + 1 < combined.length) {
      displayIdInput = combined[i + 1]
    } else if (arg.startsWith("--product-title=")) {
      productTitle = arg.split("=")[1]
    } else if (arg === "--product-title" && i + 1 < combined.length) {
      productTitle = combined[i + 1]
    } else if (arg.startsWith("--quantity=")) {
      quantity = parseInt(arg.split("=")[1], 10)
    } else if (arg === "--quantity" && i + 1 < combined.length) {
      quantity = parseInt(combined[i + 1], 10)
    } else if (arg.startsWith("--status=")) {
      statusFilter = arg.split("=")[1]
    } else if (arg === "--status" && i + 1 < combined.length) {
      statusFilter = combined[i + 1]
    } else if (arg.startsWith("--stocked-quantity=")) {
      stockedQuantity = parseInt(arg.split("=")[1], 10)
    } else if (arg === "--stocked-quantity" && i + 1 < combined.length) {
      stockedQuantity = parseInt(combined[i + 1], 10)
    }
  }

  return {
    latestPrepared,
    listPrepared,
    vendorOrderId,
    displayIdInput,
    productTitle,
    quantity,
    statusFilter,
    stockedQuantity
  }
}

export default async function repairCurrentVendorOrderInventory({
  container,
  args,
}: ExecArgs) {
  console.log("[VENDOR_ORDER_INVENTORY_REPAIR_START]", {
    processArgv: process.argv,
    args,
  })

  try {
    const parsed = parseArgs(args)
    console.log("[REPAIR_SCRIPT_PARSED_ARGS]", parsed)

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)
    if (!marketplaceService) {
      throw new Error("MARKETPLACE_SERVICE_RESOLUTION_FAILED")
    }

    // Phase 1: List prepared mode
    if (parsed.listPrepared) {
      const { data: preparedOrders } = await query.graph({
        entity: "vendor_order",
        fields: [
          "id",
          "display_id",
          "order_id",
          "vendor_id",
          "status",
          "created_at",
          "metadata",
          "items.id",
          "items.title",
          "items.quantity"
        ],
        filters: { status: "prepared" },
      })

      console.log("[VENDOR_PREPARED_ORDERS_LIST]")
      for (const order of (preparedOrders || [])) {
        console.log(JSON.stringify({
          id: order.id,
          displayId: order.display_id,
          parentOrderId: order.order_id,
          vendorId: order.vendor_id,
          status: order.status,
          createdAt: order.created_at,
          itemCount: order.items?.length || 0,
          itemTitles: (order.items || []).map((i: any) => i.title),
          itemQuantities: (order.items || []).map((i: any) => i.quantity)
        }, null, 2))
      }
      console.log("[VENDOR_ORDER_INVENTORY_REPAIR_DONE] Finished listing prepared orders.")
      return
    }

    // Retrieve all vendor orders to perform resolution filtering
    const { data: allOrders } = await query.graph({
      entity: "vendor_order",
      fields: ["id", "display_id", "order_id", "vendor_id", "status", "metadata"],
      filters: {}
    })

    // Query parent Medusa orders to obtain their display_ids for mapping
    const { data: parentOrders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id"]
    })
    const parentDisplayMap = new Map<string, string | number>()
    for (const po of (parentOrders || [])) {
      if (po.display_id !== null && po.display_id !== undefined) {
        parentDisplayMap.set(po.id, po.display_id)
      }
    }

    let candidates: VendorOrderCandidate[] = [...(allOrders || [])]

    // Filter candidates by display ID if provided
    if (parsed.displayIdInput) {
      const cleanDisplayId = parsed.displayIdInput.replace(/^#/, "").trim().toLowerCase()

      candidates = candidates.filter((order: any) => {
        if (order.id.toLowerCase() === cleanDisplayId) return true
        if (order.id.toLowerCase().endsWith(cleanDisplayId)) return true
        if (order.display_id != null && String(order.display_id).toLowerCase() === cleanDisplayId) return true
        if (order.metadata?.display_id != null && String(order.metadata.display_id).toLowerCase() === cleanDisplayId) return true
        if (order.metadata?.order_number != null && String(order.metadata.order_number).toLowerCase() === cleanDisplayId) return true
        if (order.order_id && order.order_id.toLowerCase() === cleanIdMatch(cleanDisplayId)) return true
        const parentDisplay = parentDisplayMap.get(order.order_id)
        if (parentDisplay != null && String(parentDisplay).toLowerCase() === cleanDisplayId) return true
        return false
      })

      console.log("[VENDOR_ORDER_DISPLAY_ID_RESOLUTION]", {
        inputDisplayId: parsed.displayIdInput,
        normalizedDisplayId: cleanDisplayId,
        candidateCount: candidates.length,
        candidates: candidates.map((c: any) => ({
          id: c.id,
          displayId: c.display_id,
          parentOrderId: c.order_id,
          status: c.status
        }))
      })
    }

    // Filter candidates by direct vendor_order_id if provided
    if (parsed.vendorOrderId) {
      const cleanId = parsed.vendorOrderId.replace(/^#/, "").trim().toLowerCase()
      candidates = candidates.filter((order: any) => {
        return order.id.toLowerCase() === cleanId || order.id.toLowerCase().endsWith(cleanId)
      })
    }

    // Helper helper to match order_id clean logic
    function cleanIdMatch(val: string) {
      return val.replace(/^order_/, "")
    }

    // Phase 3: Resolve candidates by product, quantity, status
    const matchedCandidates: any[] = []
    for (const cand of candidates) {
      const { data: items } = await query.graph({
        entity: "vendor_order_item",
        fields: ["id", "title", "quantity", "vendor_id"],
        filters: { vendor_order: { id: cand.id } }
      })

      let isMatch = true
      if (parsed.productTitle) {
        const hasProduct = items.some((i: any) => i.title.toLowerCase() === parsed.productTitle.toLowerCase())
        if (!hasProduct) isMatch = false
      }
      if (parsed.quantity !== null) {
        const hasQty = items.some((i: any) => i.quantity === parsed.quantity)
        if (!hasQty) isMatch = false
      }
      if (parsed.statusFilter) {
        if (cand.status !== parsed.statusFilter) isMatch = false
      }

      // Current target requirements check
      if (cand.vendor_id !== "01KWVC9G2Q5334F0TMQV4YNYSJ") {
        isMatch = false
      }

      console.log("[VENDOR_ORDER_CANDIDATE_MATCH]", {
        vendorOrderId: cand.id,
        productTitle: parsed.productTitle || "(none)",
        quantity: parsed.quantity || "(none)",
        status: cand.status,
        matched: isMatch
      })

      if (isMatch) {
        matchedCandidates.push(cand)
      }
    }

    let finalOrder: VendorOrderCandidate | null = null
    if (matchedCandidates.length === 1) {
      finalOrder = matchedCandidates[0]
    } else if (matchedCandidates.length === 0) {
      throw new Error("VENDOR_ORDER_DISPLAY_ID_NOT_FOUND")
    } else {
      // If displayIdInput was provided and multiple matches still exist
      if (parsed.displayIdInput) {
        throw new Error("VENDOR_ORDER_DISPLAY_ID_AMBIGUOUS")
      }
      // If we used fallback with latest prepared
      if (parsed.latestPrepared) {
        finalOrder = matchedCandidates[0]
      } else {
        throw new Error("VENDOR_ORDER_DISPLAY_ID_AMBIGUOUS")
      }
    }
    if (!finalOrder) {
      throw new Error("VENDOR_ORDER_RESOLUTION_FAILED")
    }

    // Phase 5: Verify Actual Database Order
    const { data: orderItems } = await query.graph({
      entity: "vendor_order_item",
      fields: ["id", "line_item_id", "variant_id", "quantity", "product_id", "sku", "title"],
      filters: { vendor_order: { id: finalOrder.id } }
    })

    console.log("[VENDOR_CURRENT_ORDER_FOUND]", {
      vendorOrderId: finalOrder.id,
      visibleDisplayId: finalOrder.display_id || parentDisplayMap.get(finalOrder.order_id) || finalOrder.id.slice(-6).toUpperCase(),
      parentOrderId: finalOrder.order_id,
      vendorId: finalOrder.vendor_id,
      status: finalOrder.status,
      items: (orderItems || []).map((i: any) => ({
        id: i.id,
        title: i.title,
        quantity: i.quantity,
        variantId: i.variant_id
      }))
    })

    if (finalOrder.vendor_id !== "01KWVC9G2Q5334F0TMQV4YNYSJ") {
      throw new Error("VENDOR_STOCK_LOCATION_OWNERSHIP_MISMATCH")
    }
    if (finalOrder.status !== "prepared") {
      throw new Error("VENDOR_ORDER_NOT_PREPARED")
    }

    const hasOrganicOil = orderItems.some((i: any) => i.title.toLowerCase() === "organic oil")
    const hasQty3 = orderItems.some((i: any) => i.quantity === 3)
    if (!hasOrganicOil || !hasQty3) {
      throw new Error("VENDOR_ORDER_ITEMS_MISMATCH_EXPECTED_OIL_QTY_3")
    }

    // Phase 7: Resolve Vendor Stock Location
    const { data: vendorLocations } = await query.graph({
      entity: "vendor_stock_location",
      fields: ["id", "vendor_id", "stock_location_id"],
      filters: { vendor_id: finalOrder.vendor_id },
    })

    if (!vendorLocations || vendorLocations.length === 0) {
      throw new Error("VENDOR_STOCK_LOCATION_NOT_FOUND")
    }

    const locationId = vendorLocations[0].stock_location_id
    const stockLocationService: any = container.resolve(Modules.STOCK_LOCATION)
    const location = await stockLocationService.retrieveStockLocation(locationId)
    if (!location) {
      throw new Error("VENDOR_STOCK_LOCATION_NOT_FOUND")
    }

    console.log("[VENDOR_CURRENT_STOCK_LOCATION_RESOLVED]", {
      vendorId: finalOrder.vendor_id,
      locationId: location.id,
      locationName: location.name,
      linkActive: true
    })

    if (location.id !== "sloc_01KXK9547YCY2FE637VTCFG7SZ") {
      throw new Error("VENDOR_STOCK_LOCATION_OWNERSHIP_MISMATCH")
    }

    const inventoryService: any = container.resolve(Modules.INVENTORY)
    const repairedItems: string[] = []
    const verifiedLevels: string[] = []

    for (const item of orderItems) {
      // Use the reusable resolver helper
      const resolved = await resolveVendorOrderItemInventory({
        container,
        vendorOrderItem: item,
        parentOrderId: finalOrder.order_id
      })

      // Backfill variant_id and other details if variant_id was empty
      if (!item.variant_id) {
        await marketplaceService.updateVendorOrderItems({
          id: item.id,
          variant_id: resolved.variantId,
          product_id: resolved.productId,
          sku: item.sku || resolved.sku || "",
          title: item.title || resolved.title || ""
        })

        console.log("[VENDOR_CURRENT_ORDER_ITEM_BACKFILLED]", {
          vendorOrderItemId: item.id,
          variantId: resolved.variantId,
          productId: resolved.productId,
          title: item.title || resolved.title || "",
          sku: item.sku || resolved.sku || ""
        })
      }

      console.log("[VENDOR_CURRENT_VARIANT_INVENTORY_RESOLVED]", {
        variantId: resolved.variantId,
        manageInventory: resolved.manageInventory,
        inventoryLinks: resolved.inventoryItems.map(link => ({
          inventoryItemId: link.inventoryItemId,
          requiredQuantity: link.requiredQuantity
        }))
      })

      if (!resolved.manageInventory) {
        console.log("[VENDOR_CURRENT_ORDER_INVENTORY_SKIPPED_NOT_MANAGED]")
        continue
      }

      for (const link of resolved.inventoryItems) {
        const inventoryItemId = link.inventoryItemId
        const requiredInventoryQuantity = link.requiredInventoryQuantity

        console.log("[VENDOR_CURRENT_REQUIRED_INVENTORY]", {
          orderedQuantity: resolved.orderedQuantity,
          requiredQuantityPerUnit: link.requiredQuantity,
          requiredInventoryQuantity
        })

        // Phase 8: Query Level Before Create
        const levels = await inventoryService.listInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: locationId
        })

        console.log("[VENDOR_CURRENT_INVENTORY_LEVEL_BEFORE]", {
          inventoryItemId,
          locationId,
          resultCount: levels.length,
          levels: levels.map((l: any) => ({
            id: l.id,
            inventory_item_id: l.inventory_item_id,
            location_id: l.location_id,
            stocked_quantity: l.stocked_quantity,
            reserved_quantity: l.reserved_quantity
          }))
        })

        // Phase 9: Create Or Update Level
        let inventoryLevelId = ""
        if (levels.length === 0) {
          const created = await inventoryService.createInventoryLevels([{
            inventory_item_id: inventoryItemId,
            location_id: locationId,
            stocked_quantity: parsed.stockedQuantity
          }])
          const createdLevel = Array.isArray(created) ? created[0] : created
          inventoryLevelId = createdLevel.id
          console.log("[VENDOR_CURRENT_INVENTORY_LEVEL_CREATED]", {
            inventoryLevelId,
            inventoryItemId,
            locationId,
            stockedQuantity: parsed.stockedQuantity
          })
        } else {
          const existingLevel = levels[0]
          inventoryLevelId = existingLevel.id
          await inventoryService.updateInventoryLevels([{
            id: inventoryLevelId,
            stocked_quantity: parsed.stockedQuantity
          }])
          console.log("[VENDOR_CURRENT_INVENTORY_LEVEL_REUSED]", {
            inventoryLevelId,
            inventoryItemId,
            locationId,
            stockedQuantity: parsed.stockedQuantity
          })
        }

        // Phase 10: Verify After Create
        const verifyLevels = await inventoryService.listInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: locationId
        })

        const verifyCount = verifyLevels.length
        const verifiedLevel = verifyLevels?.[0]
        const availableQuantity = verifiedLevel ? (verifiedLevel.stocked_quantity - (verifiedLevel.reserved_quantity || 0)) : 0

        console.log("[VENDOR_CURRENT_INVENTORY_LEVEL_VERIFIED]", {
          resultCount: verifyCount,
          inventoryLevelId: verifiedLevel?.id,
          inventoryItemId,
          locationId,
          stockedQuantity: verifiedLevel?.stocked_quantity,
          reservedQuantity: verifiedLevel?.reserved_quantity,
          availableQuantity,
          requiredInventoryQuantity
        })

        if (verifyCount !== 1 || !verifiedLevel?.id || availableQuantity < requiredInventoryQuantity) {
          throw new Error("VENDOR_CURRENT_INVENTORY_LEVEL_VERIFICATION_FAILED")
        }

        repairedItems.push(item.id)
        verifiedLevels.push(verifiedLevel.id)
      }
    }

    if (repairedItems.length === 0) {
      throw new Error("VENDOR_ORDER_INVENTORY_NO_ITEMS_REPAIRED")
    }

    if (verifiedLevels.length === 0) {
      throw new Error("VENDOR_ORDER_INVENTORY_NO_LEVELS_VERIFIED")
    }

    console.log("[VENDOR_ORDER_INVENTORY_REPAIR_DONE]", {
      vendorOrderId: finalOrder.id,
      repairedItems,
      verifiedLevels
    })

  } catch (error: any) {
    console.error("[VENDOR_ORDER_INVENTORY_REPAIR_FAILED]", {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    })
    throw error
  }
}
