import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type ResolveItemInventoryInput = {
  container: any
  vendorOrderItem: any
  parentOrderId: string
}

type ResolvedInventoryItemLink = {
  inventoryItemId: string
  requiredQuantity: number
  requiredInventoryQuantity: number
}

type ResolveItemInventoryOutput = {
  lineItemId: string
  variantId: string
  productId: string
  manageInventory: boolean
  inventoryItems: ResolvedInventoryItemLink[]
  orderedQuantity: number
  requiredInventoryQuantity: number
  sku?: string
  title?: string
}

/**
 * Reusable resolver that resolves:
 * VendorOrderItem.line_item_id -> Parent Medusa OrderLineItem -> Variant ID -> VariantInventoryItem link -> InventoryItem
 */
export async function resolveVendorOrderItemInventory(
  input: ResolveItemInventoryInput
): Promise<ResolveItemInventoryOutput> {
  const { container, vendorOrderItem, parentOrderId } = input
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  let variantId =
    vendorOrderItem.variant_id ||
    vendorOrderItem.metadata?.variant_id ||
    null

  let parentLineItem: any = null

  // Always query the parent line item to ensure we have backup details and verify variantId
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "items.id",
      "items.variant_id",
      "items.product_id",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.metadata"
    ],
    filters: { id: parentOrderId }
  })

  const parentOrder = orders?.[0]
  if (!parentOrder) {
    throw new Error("PARENT_ORDER_NOT_FOUND")
  }

  parentLineItem = (parentOrder.items || []).find(
    (i: any) => i.id === vendorOrderItem.line_item_id
  )

  if (!variantId) {
    if (!parentLineItem) {
      throw new Error("PARENT_ORDER_LINE_ITEM_NOT_FOUND")
    }
    variantId = parentLineItem.variant_id
  }

  if (!variantId) {
    throw new Error("PARENT_ORDER_LINE_ITEM_NOT_FOUND")
  }

  if (parentLineItem) {
    console.log("[PARENT_ORDER_LINE_ITEM_RESOLVED]", {
      lineItemId: parentLineItem.id,
      variantId,
      productId: parentLineItem.product_id,
      title: parentLineItem.title,
      quantity: parentLineItem.quantity
    })
  }

  // Query Variant & Inventory links
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "sku",
      "manage_inventory",
      "inventory_items.inventory_item_id",
      "inventory_items.required_quantity"
    ],
    filters: { id: variantId }
  })

  const variant = variants?.[0]
  if (!variant) {
    throw new Error(`VARIANT_NOT_FOUND: ${variantId}`)
  }

  const manageInventory = variant.manage_inventory ?? true
  const inventoryItemsRaw = variant.inventory_items || []

  console.log("[VENDOR_VARIANT_INVENTORY_RESOLVED]", {
    variantId,
    manageInventory,
    inventoryItems: inventoryItemsRaw.map((link: any) => ({
      inventoryItemId: link.inventory_item_id,
      requiredQuantity: link.required_quantity || 1
    }))
  })

  if (!manageInventory) {
    console.log("[VENDOR_INVENTORY_SKIPPED_NOT_MANAGED]")
    return {
      lineItemId: vendorOrderItem.line_item_id,
      variantId,
      productId: parentLineItem?.product_id || vendorOrderItem.product_id || "",
      manageInventory: false,
      inventoryItems: [],
      orderedQuantity: vendorOrderItem.quantity,
      requiredInventoryQuantity: 0,
      sku: parentLineItem?.sku || variant?.sku || "",
      title: parentLineItem?.title || variant?.title || ""
    }
  }

  if (inventoryItemsRaw.length === 0) {
    throw new Error("VARIANT_INVENTORY_ITEM_LINK_MISSING")
  }

  const orderedQuantity = vendorOrderItem.quantity
  const inventoryItems: ResolvedInventoryItemLink[] = []

  for (const link of inventoryItemsRaw) {
    const requiredQuantityPerUnit = link.required_quantity || 1
    const requiredInventoryQuantity = orderedQuantity * requiredQuantityPerUnit

    console.log("[VENDOR_REQUIRED_INVENTORY_CALCULATED]", {
      orderedQuantity,
      requiredQuantityPerUnit,
      requiredInventoryQuantity
    })

    inventoryItems.push({
      inventoryItemId: link.inventory_item_id,
      requiredQuantity: requiredQuantityPerUnit,
      requiredInventoryQuantity
    })
  }

  const totalRequired = inventoryItems.reduce((acc, item) => acc + item.requiredInventoryQuantity, 0)

  return {
    lineItemId: vendorOrderItem.line_item_id,
    variantId,
    productId: parentLineItem?.product_id || vendorOrderItem.product_id || "",
    manageInventory: true,
    inventoryItems,
    orderedQuantity,
    requiredInventoryQuantity: totalRequired,
    sku: parentLineItem?.sku || variant?.sku || "",
    title: parentLineItem?.title || variant?.title || ""
  }
}
