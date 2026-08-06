export type BundleComponentInventory = {
  variant_id: string
  quantity: number
  allow_backorder?: boolean
  manage_inventory?: boolean
  inventory_items?: Array<{
    inventory_item_id: string
    required_quantity?: number
    inventory?: { location_levels?: Array<{ location_id: string; available_quantity?: number; stocked_quantity?: number; reserved_quantity?: number }> }
  }>
}

export function calculateBundleAvailability(components: BundleComponentInventory[], locationIds: string[]) {
  return locationIds.map((locationId) => {
    let available = Number.POSITIVE_INFINITY
    const allocations: any[] = []
    for (const component of components) {
      if (!Number.isInteger(component.quantity) || component.quantity < 1) throw new Error("Bundle component quantity must be a positive integer")
      if (component.manage_inventory === false || component.allow_backorder) continue
      if (!component.inventory_items?.length) return { location_id: locationId, available_quantity: 0, allocations: [] }
      for (const link of component.inventory_items) {
        const level = link.inventory?.location_levels?.find((candidate) => candidate.location_id === locationId)
        if (!level) return { location_id: locationId, available_quantity: 0, allocations: [] }
        const linkRequired = Number(link.required_quantity || 1)
        const perBundle = component.quantity * linkRequired
        const levelAvailable = Number.isFinite(Number(level.available_quantity))
          ? Number(level.available_quantity)
          : Number(level.stocked_quantity || 0) - Number(level.reserved_quantity || 0)
        available = Math.min(available, Math.floor(Math.max(0, levelAvailable) / perBundle))
        allocations.push({ variant_id: component.variant_id, inventory_item_id: link.inventory_item_id, location_id: locationId, quantity_per_bundle: perBundle })
      }
    }
    return { location_id: locationId, available_quantity: Number.isFinite(available) ? available : 1_000_000_000, allocations }
  })
}

export async function loadBundleOperationalContext(scope: any, bundle: any, requestedQuantity = 1, context: { sales_channel_id?: string; country_code?: string } = {}) {
  const service: any = scope.resolve("bundle")
  const query: any = scope.resolve("query")
  const items = await service.listBundleItems({ bundle_id: bundle.id }, { order: { sort_order: "ASC" } })
  if (!items.length) throw new Error("Bundle has no components")
  const variantIds = items.map((item: any) => item.variant_id)
  if (new Set(variantIds).size !== variantIds.length) throw new Error("Bundle contains duplicate components")
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "title", "sku", "manage_inventory", "allow_backorder", "product.id", "product.title", "product.thumbnail", "product.status", "product.sales_channels.id", "inventory_items.inventory_item_id", "inventory_items.required_quantity", "inventory_items.inventory.location_levels.location_id", "inventory_items.inventory.location_levels.available_quantity", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity"],
    filters: { id: variantIds },
    pagination: { take: 100 },
  })
  if (variants.length !== variantIds.length) throw new Error("One or more component variants no longer exist")
  const byId = new Map(variants.map((variant: any) => [variant.id, variant]))
  const components = items.map((item: any) => {
    const variant: any = byId.get(item.variant_id)
    if (variant.product?.status !== "published") throw new Error(`Component ${variant.id} is not published`)
    if (context.sales_channel_id && !variant.product?.sales_channels?.some((channel: any) => channel.id === context.sales_channel_id)) throw new Error(`Component ${variant.id} is not available in this sales channel`)
    return { ...variant, variant_id: variant.id, quantity: item.quantity, sort_order: item.sort_order }
  })
  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name", "address.country_code", "sales_channels.id"],
    pagination: { take: 1000 },
  })
  const eligibleLocations = locations.filter((location: any) =>
    (!context.sales_channel_id || location.sales_channels?.some((channel: any) => channel.id === context.sales_channel_id)) &&
    (!context.country_code || String(location.address?.country_code || "").toLowerCase() === context.country_code.toLowerCase())
  )
  if (!eligibleLocations.length) throw new Error("No eligible regional stock location is configured")
  const locationAvailability = calculateBundleAvailability(components, eligibleLocations.map((location: any) => location.id))
  const selected = [...locationAvailability].sort((a, b) => b.available_quantity - a.available_quantity)[0]
  return {
    components,
    locations: eligibleLocations,
    location_availability: locationAvailability,
    selected_location: selected,
    available_quantity: selected?.available_quantity || 0,
    can_fulfill: Boolean(selected && selected.available_quantity >= requestedQuantity),
  }
}
