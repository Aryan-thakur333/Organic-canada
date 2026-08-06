import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle"

/** Read-only diagnostic; it does not create a cart, payment, or order. */
export default async function auditCurrentBundleCompletionCandidate({ container }: ExecArgs) {
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const bundleService: any = container.resolve(BUNDLE_MODULE)
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id", "subtotal", "tax_total", "total", "completed_at",
      "payment_collection.id", "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.provider_id", "payment_collection.payment_sessions.status",
    ],
    pagination: { take: 100 },
  })

  const candidates: Array<Record<string, unknown>> = []
  for (const cart of carts || []) {
    if (cart.completed_at || Number(cart.subtotal) !== 2199 || Number(cart.tax_total) !== 110 || Number(cart.total) !== 2309) continue
    const snapshots = await bundleService.listBundleLineSnapshots({ cart_id: cart.id, status: "active" })
    if (!snapshots.length) continue
    candidates.push({
      cartId: cart.id,
      subtotal: cart.subtotal,
      taxTotal: cart.tax_total,
      total: cart.total,
      activeSnapshotCount: snapshots.length,
      paymentCollectionId: cart.payment_collection?.id || null,
      paymentSessions: (cart.payment_collection?.payment_sessions || []).map((session: any) => ({ id: session.id, providerId: session.provider_id, status: session.status })),
    })
  }
  console.log("[ORDER_COMPLETION_CANDIDATE_AUDIT]")
  console.log(JSON.stringify({ candidateCount: candidates.length, candidates }, null, 2))
}
