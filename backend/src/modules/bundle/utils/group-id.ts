/**
 * Returns the only supported bundle group identifier from a cart line.
 * Keep this in one place so adding, reserving, removing, and completing a
 * bundle all use the same value and never fall back to a guessed identifier.
 */
export function getBundleGroupId(line: any): string | null {
  const value = line?.metadata?.bundle_group_id
  if (typeof value !== "string") return null

  const bundleGroupId = value.trim()
  return bundleGroupId.length > 0 ? bundleGroupId : null
}
