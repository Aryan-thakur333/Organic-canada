import { BUNDLE_MODULE } from ".."
import { getBundleGroupId } from "./group-id"

const isDevelopmentDiagnostics = () => process.env.NODE_ENV === "development"

export class BundleSnapshotIntegrityError extends Error {
  code: string
  status: number
  details?: Record<string, unknown>

  constructor(code: string, message: string, details?: Record<string, unknown>, status = 409) {
    super(message)
    this.name = "BundleSnapshotIntegrityError"
    this.code = code
    this.status = status
    this.details = details
  }
}

/**
 * Finds exactly one active snapshot using the persisted cart/group fields.
 * Metadata is intentionally not used as a lookup fallback: legacy carts must
 * be repaired by the explicit admin script before they are checkout-eligible.
 */
export async function getActiveCartBundleSnapshot({
  scope,
  cartId,
  bundleGroupId,
}: {
  scope: any
  cartId: string
  bundleGroupId: string
}) {
  let bundleService: any
  try {
    bundleService = scope.resolve(BUNDLE_MODULE)
  } catch (cause: any) {
    const error = new BundleSnapshotIntegrityError("BUNDLE_SNAPSHOT_QUERY_FAILED", "Bundle snapshot service is unavailable.", { cart_id: cartId, bundle_group_id: bundleGroupId }, 500)
    if (isDevelopmentDiagnostics()) console.error("[BUNDLE_SNAPSHOT_QUERY_TRACE]", JSON.stringify({ cartId, bundleGroupId, serviceResolved: false, queryMethod: "listBundleLineSnapshots", filterShape: {}, rawResultCount: 0, errorName: cause?.name || "Error", errorCode: cause?.code || "", errorMessage: cause?.message || "" }))
    throw error
  }
  const filterShape = { cart_id: cartId, bundle_group_id: bundleGroupId, status: "active" }
  let snapshots: any[]
  try {
    snapshots = await bundleService.listBundleLineSnapshots(filterShape)
  } catch (cause: any) {
    const error = new BundleSnapshotIntegrityError("BUNDLE_SNAPSHOT_QUERY_FAILED", "Unable to query bundle snapshot state.", { cart_id: cartId, bundle_group_id: bundleGroupId }, 500)
    if (isDevelopmentDiagnostics()) console.error("[BUNDLE_SNAPSHOT_QUERY_TRACE]", JSON.stringify({ cartId, bundleGroupId, serviceResolved: true, queryMethod: "listBundleLineSnapshots", filterShape, rawResultCount: 0, errorName: cause?.name || "Error", errorCode: cause?.code || "", errorMessage: cause?.message || "" }))
    throw error
  }
  if (isDevelopmentDiagnostics()) console.info("[BUNDLE_SNAPSHOT_QUERY_TRACE]", JSON.stringify({ cartId, bundleGroupId, serviceResolved: true, queryMethod: "listBundleLineSnapshots", filterShape, rawResultCount: snapshots.length, errorName: "", errorCode: "", errorMessage: "" }))

  if (snapshots.length === 0) {
    throw new BundleSnapshotIntegrityError(
      "BUNDLE_SNAPSHOT_NOT_FOUND",
      `Bundle snapshot is missing for group ${bundleGroupId}.`,
      { cart_id: cartId, bundle_group_id: bundleGroupId },
      404
    )
  }

  if (snapshots.length !== 1) {
    throw new BundleSnapshotIntegrityError(
      "BUNDLE_SNAPSHOT_DUPLICATE",
      `Bundle snapshot integrity failed for group ${bundleGroupId}.`,
      { cart_id: cartId, bundle_group_id: bundleGroupId, snapshot_count: snapshots.length }
    )
  }

  const snapshot = snapshots[0]
  try {
    const bundle = await bundleService.retrieveBundleDefinition(snapshot.bundle_id)
    if (!bundle) throw new Error("Bundle definition not found")
    return { snapshot, bundle, componentSnapshot: snapshot.component_snapshot || {} }
  } catch (cause: any) {
    const error = new BundleSnapshotIntegrityError("BUNDLE_SNAPSHOT_QUERY_FAILED", "Unable to load bundle definition for the active snapshot.", { cart_id: cartId, bundle_group_id: bundleGroupId, snapshot_id: snapshot.id }, 500)
    if (isDevelopmentDiagnostics()) console.error("[BUNDLE_SNAPSHOT_QUERY_TRACE]", JSON.stringify({ cartId, bundleGroupId, serviceResolved: true, queryMethod: "retrieveBundleDefinition", filterShape: { id: snapshot.bundle_id }, rawResultCount: 0, errorName: cause?.name || "Error", errorCode: cause?.code || "", errorMessage: cause?.message || "" }))
    throw error
  }
}

export function validateCartBundleSnapshot({ cart, bundleGroupId, snapshot }: { cart: any; bundleGroupId: string; snapshot: any }) {
  const lines = (cart.items || []).filter((line: any) => getBundleGroupId(line) === bundleGroupId)
  const lineBundleIds = new Set<string>(lines.map((line: any) => String(line.metadata?.bundle_id || "")).filter(Boolean))
  const expected = new Map<string, number>((snapshot.component_snapshot?.components || []).map((component: any) => [String(component.variant_id), Number(component.total_quantity)]))
  const actual = new Map<string, number>()
  for (const line of lines) actual.set(line.variant_id, (actual.get(line.variant_id) || 0) + Number(line.quantity || 0))
  const componentsMatch = lines.length > 0 && lineBundleIds.size === 1 && lineBundleIds.has(snapshot.bundle_id) && expected.size === actual.size && [...expected].every(([variantId, quantity]) => actual.get(variantId) === quantity)
  if (!componentsMatch) {
    throw new BundleSnapshotIntegrityError("BUNDLE_COMPONENT_MISMATCH", `Bundle components do not match snapshot for group ${bundleGroupId}.`, { cart_id: cart.id, bundle_group_id: bundleGroupId })
  }

  const lineTotal = lines.reduce((total: number, line: any) => total + Number(line.unit_price || 0) * Number(line.quantity || 0), 0)
  const expectedTotal = Number(snapshot.bundle_price_snapshot?.total_price)
  const expectedCurrency = String(snapshot.bundle_price_snapshot?.currency_code || "").toLowerCase()
  if (!Number.isInteger(expectedTotal) || lineTotal !== expectedTotal || expectedCurrency !== String(cart.currency_code || "").toLowerCase()) {
    throw new BundleSnapshotIntegrityError("BUNDLE_PRICE_MISMATCH", `Bundle price does not match snapshot for group ${bundleGroupId}.`, { cart_id: cart.id, bundle_group_id: bundleGroupId })
  }
}
