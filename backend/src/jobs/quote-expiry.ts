import { MedusaContainer } from "@medusajs/framework/types"
import { B2B_MODULE } from "../modules/b2b"

/**
 * Quote Expiry Scheduled Job
 *
 * Runs daily at 3 AM and automatically rejects B2B wholesale quotes
 * that have been in 'draft' or 'pending' status for more than 30 days.
 *
 * Stale quotes accumulate when customers submit requests but never
 * follow up, or when admins leave quotes unreviewed. This job keeps
 * the B2B dashboard clean and prevents negotiation dead ends.
 */
export default async function quoteExpiryJob(container: MedusaContainer) {
  const b2bService: any = container.resolve(B2B_MODULE)

  // ── 1. Compute the cutoff date (30 days ago) ─────────────────────────
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  cutoff.setHours(0, 0, 0, 0)

  try {
    // ── 2. Fetch all expirable quotes ──────────────────────────────────
    //     MedusaService.listQuotes supports passing an array of status values.
    const expirable = await b2bService.listQuotes({
      status: ["draft", "pending"],
    })

    if (!expirable || expirable.length === 0) {
      console.log("[Quote Expiry Job] No draft or pending quotes to check.")
      return
    }

    // Safe unwrap: handle both raw array and { data: [...] } envelope
    const quoteList = Array.isArray(expirable) ? expirable : (expirable.data as any[]) || []

    // ── 3. Filter to only those older than the cutoff ──────────────────
    const expired = quoteList.filter((q: any) => {
      if (!q.created_at) return false
      return new Date(q.created_at) < cutoff
    })

    if (expired.length === 0) {
      console.log("[Quote Expiry Job] No quotes older than 30 days found.")
      return
    }

    console.log(
      `[Quote Expiry Job] Found ${expired.length} expired quote(s) older than ${cutoff.toISOString().split("T")[0]}`
    )

    // ── 4. Reject each expired quote with an audit trail ───────────────
    let rejected = 0
    let errors = 0

    for (const quote of expired) {
      try {
        await b2bService.updateQuotes({
          id: quote.id,
          status: "rejected",
          admin_notes:
            (quote.admin_notes ? quote.admin_notes + "\n" : "") +
            `[Auto-expired] Quote was in '${quote.status}' status for >30 days. Rejected by scheduled job on ${new Date().toISOString().split("T")[0]}.`,
          metadata: {
            ...(quote.metadata || {}),
            auto_expired: true,
            auto_expired_at: new Date().toISOString(),
            auto_expired_from_status: quote.status,
          },
        })

        console.log(
          `[Quote Expiry Job] Rejected quote ${quote.id} ` +
            `(customer: ${quote.customer_email}, was: ${quote.status}, created: ${quote.created_at?.split("T")[0]})`
        )

        rejected++
      } catch (err: any) {
        errors++
        console.error(`[Quote Expiry Job] Failed to expire quote ${quote.id}: ${err.message}`)
      }
    }

    // ── 5. Report results ──────────────────────────────────────────────
    console.log(
      `[Quote Expiry Job] Complete: ${rejected} expired, ${errors} error(s)`
    )
  } catch (error: any) {
    console.error("[Quote Expiry Job] Failed to query quotes:", error)
  }
}

export const config = {
  name: "b2b-quote-expiry",
  schedule: "0 3 * * *", // Every day at 3 AM
}
