import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MedusaError } from "@medusajs/framework/utils"

export async function validateQuoteInventoryAvailability({ quote, container }: { quote: any; container: any }) {
  const items = quote.negotiated_items || quote.requested_items || quote.items || []
  
  const variantIds = items
    .filter((item: any) => item.variant_id && item.requires_allocation !== false && item.metadata?.manual_quote_item !== true && item.requires_shipping !== false)
    .map((item: any) => item.variant_id)
    .filter(Boolean)

  if (!variantIds.length) {
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "allow_backorder",
      "inventory_items.inventory.location_levels.stocked_quantity",
      "inventory_items.inventory.location_levels.reserved_quantity",
    ],
    filters: { id: variantIds },
  })

  for (const item of items) {
    if (!item.variant_id || item.requires_allocation === false || item.metadata?.manual_quote_item === true || item.requires_shipping === false) {
      continue
    }

    const variant = variants?.find((v: any) => v.id === item.variant_id)
    if (!variant) continue

    const inventoryLinks = Array.isArray(variant?.inventory_items) ? variant.inventory_items : []
    
    if (!inventoryLinks.length) {
      continue // not tracked in inventory
    }

    let available = 0
    for (const link of inventoryLinks) {
      const levels = link?.inventory?.location_levels || []
      for (const level of levels) {
        available += Number(level?.stocked_quantity || 0) - Number(level?.reserved_quantity || 0)
      }
    }
    available = Math.max(0, available)

    const requestedQty = Number(item.quantity || 0)

    if (requestedQty > available && !variant.allow_backorder) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Only ${available} units are available for ${item.title || "the requested item"}. Requested ${requestedQty}.`
      )
    }
  }
}
