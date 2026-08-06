import { createHash } from "crypto"
import type { ReviewRow } from "./csv-helpers"

export const PROOF_TTL_MS = 15 * 60 * 1000
type FingerprintRow = Pick<ReviewRow, "variant_id" | "product_id" | "proposed_usd_amount" | "review_status" | "notes" | "existing_usd_amount" | "current_cad_amount">
export type DryRunProof = {
  dryRunId: string
  fingerprint: string
  createdAt: number
  variantIds: string[]
}

let latestProof: DryRunProof | null = null

export function fingerprintReviewRows(rows: FingerprintRow[]): string {
  const canonical = [...rows]
    .sort((left, right) => left.variant_id.localeCompare(right.variant_id))
    .map((row) => [row.variant_id, row.product_id, row.proposed_usd_amount, row.review_status, row.notes, row.existing_usd_amount, row.current_cad_amount])
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

export function recordSuccessfulDryRun(
  fingerprint: string,
  variantIds: string[],
  now = Date.now(),
): DryRunProof {
  const dryRunId = `dry_${now.toString(36)}_${fingerprint.slice(0, 12)}`
  latestProof = {
    dryRunId,
    fingerprint,
    createdAt: now,
    variantIds: [...new Set(variantIds)].sort(),
  }
  return { ...latestProof, variantIds: [...latestProof.variantIds] }
}

export function getRecentMatchingDryRun(
  dryRunId: string,
  fingerprint: string,
  variantIds: string[],
  now = Date.now(),
): DryRunProof | null {
  const canonicalVariantIds = [...new Set(variantIds)].sort()
  if (
    !latestProof ||
    latestProof.dryRunId !== dryRunId ||
    latestProof.fingerprint !== fingerprint ||
    now - latestProof.createdAt > PROOF_TTL_MS ||
    latestProof.variantIds.length !== canonicalVariantIds.length ||
    latestProof.variantIds.some((id, index) => id !== canonicalVariantIds[index])
  ) {
    return null
  }
  return { ...latestProof, variantIds: [...latestProof.variantIds] }
}

export function clearDryRunProofForTests(): void {
  latestProof = null
}
