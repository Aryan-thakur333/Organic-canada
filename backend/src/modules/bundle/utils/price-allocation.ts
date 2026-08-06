export type BundleComponentForAllocation = {
  id: string
  quantity: number
  title: string
  sku: string
  product?: { id: string; title: string }
}

/**
 * Allocates a bundle's authoritative minor-unit total across inventory component
 * lines without decimal prices. Each component keeps its full required quantity;
 * an optional zero-priced bulk line plus one priced unit make any cent total
 * representable exactly.
 */
export function allocateBundlePriceMinor(
  bundleTotalMinor: number,
  components: BundleComponentForAllocation[],
  bundleQuantity: number
) {
  if (!Number.isInteger(bundleTotalMinor) || bundleTotalMinor <= 0) throw new Error("Bundle price must be a positive integer minor-unit amount")
  if (!Number.isInteger(bundleQuantity) || bundleQuantity < 1 || !components.length) throw new Error("Bundle allocation requires components and quantity")

  const allocationCount = components.length
  const base = Math.floor(bundleTotalMinor / allocationCount)
  let remainder = bundleTotalMinor - base * allocationCount
  const lines: Array<BundleComponentForAllocation & { quantity: number; component_quantity_per_bundle: number; unit_price: number; allocated_bundle_price_minor: number; allocation_index: number }> = []

  components.forEach((component, componentIndex) => {
    const totalQuantity = Number(component.quantity) * bundleQuantity
    if (!Number.isInteger(totalQuantity) || totalQuantity < 1) throw new Error("Bundle component quantity must be a positive integer")
    const allocated = base + (remainder-- > 0 ? 1 : 0)
    if (totalQuantity > 1) {
      lines.push({ ...component, quantity: totalQuantity - 1, component_quantity_per_bundle: component.quantity, unit_price: 0, allocated_bundle_price_minor: 0, allocation_index: componentIndex * 2 })
    }
    lines.push({ ...component, quantity: 1, component_quantity_per_bundle: component.quantity, unit_price: allocated, allocated_bundle_price_minor: allocated, allocation_index: componentIndex * 2 + 1 })
  })

  const allocatedTotal = lines.reduce((total, line) => total + line.unit_price * line.quantity, 0)
  if (allocatedTotal !== bundleTotalMinor) throw new Error("Bundle minor-unit allocation did not reconcile")
  return lines
}
