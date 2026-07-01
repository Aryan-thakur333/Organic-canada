import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../../../../../../modules/b2b"

// ── Helper: find or create the B2B customer group ─────────────────────────

async function findOrCreateB2BCustomerGroup(customerModule: any): Promise<any> {
  const GROUP_NAMES = ["B2b parteners", "B2B Partners", "B2B Customers", "B2B customer"]

  // Try to find an existing group by each candidate name
  for (const name of GROUP_NAMES) {
    try {
      const [groups] = await customerModule.listAndCountCustomerGroups({ name })
      if (groups?.[0]) {
        console.log(`[B2B Approve] Reusing existing customer group: "${name}" (${groups[0].id})`)
        return groups[0]
      }
    } catch {
      // Continue to next name
    }
  }

  // Try listing all groups to find one with a B2B-like name (case-insensitive search)
  try {
    const [allGroups] = await customerModule.listAndCountCustomerGroups({}, { take: 100 })
    const b2bGroup = allGroups.find((g: any) =>
      /b2b|wholesale|partner/i.test(g.name || "")
    )
    if (b2bGroup) {
      console.log(`[B2B Approve] Reusing existing customer group: "${b2bGroup.name}" (${b2bGroup.id})`)
      return b2bGroup
    }
  } catch {
    // Continue to create a new one
  }

  // Create a new group
  const newGroup = await customerModule.createCustomerGroups({ name: "B2B Partners" })
  console.log(`[B2B Approve] Created new customer group: "B2B Partners" (${newGroup.id})`)
  return newGroup
}

/**
 * POST /admin/b2b/companies/:id/approve
 *
 * Approves a pending B2B company application.
 *
 * Effects:
 * 1. Sets company status to "approved"
 * 2. Sets approved_at, approved_by, approved_credit_limit
 * 3. Adds the customer to the B2B customer group
 * 4. Returns updated company with customer group info
 *
 * Request body:
 * {
 *   "approved_credit_limit": 1000,   // in major units (e.g. $1000.00), optional
 *   "admin_note": "Approved for wholesale pricing"
 * }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { approved_credit_limit, admin_note } = req.body as {
    approved_credit_limit?: number | string
    admin_note?: string
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const customerModule: any = req.scope.resolve(Modules.CUSTOMER)

    // ── 1. Retrieve the company ──────────────────────────────────────────
    const company = await b2bService.retrieveCompany(id)
    if (!company) {
      return res.status(404).json({ message: "B2B company not found" })
    }

    if (company.status === "approved" || company.status === "active") {
      return res.status(400).json({ message: "Company is already approved" })
    }

    if (company.status === "suspended") {
      return res.status(400).json({ message: "Cannot approve a suspended company" })
    }

    // ── 2. Resolve the admin user ────────────────────────────────────────
    const authContext = (req as any).auth_context
    const adminUserId = authContext?.actor_id || "system"

    // ── 3. Convert credit limit from major units to cents ────────────────
    let approvedCents = company.requested_credit_limit || 0
    if (
      approved_credit_limit !== undefined &&
      approved_credit_limit !== null &&
      approved_credit_limit !== ""
    ) {
      approvedCents = Math.round(Number(approved_credit_limit) * 100)
      if (isNaN(approvedCents) || approvedCents < 0) {
        return res.status(400).json({ message: "approved_credit_limit must be a non-negative number" })
      }
    }

    // ── 4. Update company to approved status ─────────────────────────────
    const updated = await b2bService.updateCompanies({
      id,
      status: "approved",
      approved_by: adminUserId,
      approved_at: new Date(),
      approved_credit_limit: approvedCents,
      admin_note: admin_note || null,
    })

    // ── 5. Find or create B2B customer group ─────────────────────────────
    let customerGroup: any = null
    try {
      customerGroup = await findOrCreateB2BCustomerGroup(customerModule)
    } catch (err: any) {
      console.error(`[B2B Approve] Failed to find/create customer group: ${err.message}`)
    }

    // ── 6. Link customer to B2B customer group via Remote Links ─────────
    //     Medusa v2 manages customer ↔ customer_group relationships through
    //     its built-in Remote Link system. We use remoteLink.create directly.
    let customerAdded = false
    if (customerGroup && company.customer_id) {
      try {
        await customerModule.addCustomerToGroup({
          customer_group_id: customerGroup.id,
          customer_id: company.customer_id,
        })
        customerAdded = true
        console.log(
          `[B2B Approve] Added customer ${company.customer_id} to group ${customerGroup.name} (${customerGroup.id})`
        )
      } catch (linkErr: any) {
        // If already linked, that's fine
        if (!/already exists|duplicate/i.test(String(linkErr?.message || linkErr))) {
          console.error(`[B2B Approve] addCustomerToGroup failed: ${linkErr.message}`)

          // Fallback: try customerModule methods
          try {
            // Medusa v2 API — attempt various known method names
            const methods = [
              () => customerModule.addCustomerToGroup?.({ id: customerGroup.id, customer_id: company.customer_id }),
              () => customerModule.createCustomerGroupCustomers?.({ customer_group_id: customerGroup.id, customer_id: company.customer_id }),
              () => customerModule.addCustomerToCustomerGroup?.({ customer_group_id: customerGroup.id, customer_id: company.customer_id }),
            ]
            for (const method of methods) {
              const result = await method()
              if (result) {
                customerAdded = true
                console.log(`[B2B Approve] Added customer to group via fallback method`)
                break
              }
            }
          } catch (fallbackErr: any) {
            if (!fallbackErr.message?.includes?.("already")) {
              console.warn(`[B2B Approve] All fallback methods failed: ${fallbackErr.message}`)
            } else {
              customerAdded = true
            }
          }
        } else {
          customerAdded = true
        }
      }
    }

    console.log(
      `[B2B Approve] Company ${id} approved by ${adminUserId}. ` +
      `Credit: ${approvedCents}. Group: ${customerGroup?.name || "N/A"}. Customer added: ${customerAdded}`
    )

    return res.json({
      message: customerAdded
        ? "Company approved and customer added to B2B group."
        : "Company approved.",
      company: {
        id: updated.id,
        company_name: updated.company_name,
        status: "approved",
        approved_credit_limit: approvedCents,
        admin_note: admin_note || null,
      },
      customer_group: customerGroup
        ? { id: customerGroup.id, name: customerGroup.name }
        : null,
    })
  } catch (error: any) {
    console.error("[Admin B2B Approve] Error:", error)
    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }
    return res.status(500).json({ message: error.message || "Failed to approve company" })
  }
}
