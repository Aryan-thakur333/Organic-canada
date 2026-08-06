export function validateFixedBundleComponents(components: any[]) {
  if (!Array.isArray(components) || components.length < 2 || components.length > 25) throw new Error("A fixed bundle requires 2 to 25 components")
  const ids = components.map((component) => String(component.variant_id || ""))
  if (ids.some((id) => !id)) throw new Error("Every component requires a variant_id")
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate component variants are not allowed")
  if (components.some((component) => !Number.isInteger(component.quantity) || component.quantity < 1)) throw new Error("Every component quantity must be a positive integer")
  return components
}
