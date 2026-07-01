import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createCartWorkflow } from "@medusajs/medusa/core-flows"
import { B2B_MODULE } from "../../../../../../modules/b2b"
import { Modules, MedusaError } from "@medusajs/framework/utils"

/**
 * POST /store/b2b/quotes/:id/accept
 *
 * Customer accepts an approved, non-expired quote.
 * Creates a Medusa cart with quote items and metadata.
 *
 * Rules:
 * 1. Quote must belong to current customer
 * 2. Customer must still be approved B2B
 * 3. Quote status must be approved
 * 4. Quote must not be expired
 * 5. negotiated_items must exist
 * 6. Creates cart with quote metadata
 *
 * ORDER COMPLETION EXECUTION SAFEGUARD:
 *   Upon successful fulfillment transitions, the dynamic auth context tokens
 *   must not be destroyed. The company_id memory boundaries are maintained
 *   securely across window routing pops by embedding the full B2B context
 *   (company_id, company_name, customer_type) into the cart metadata. This
 *   ensures the system stays active without crashing layout templates down
 *   to unlinked states after order completion.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const service: any = req.scope.resolve(B2B_MODULE)
    const query = req.scope.resolve("query")

    // ── 1. Load quote ──────────────────────────────────────────────────
    const quote = await service.retrieveQuote(req.params.id)
    if (!quote || quote.customer_id !== customerId) {
      return res.status(404).json({ message: "Quote not found" })
    }

    // ── 2. Validate B2B company still approved ─────────────────────────
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["company.id", "company.status"],
      filters: { id: customerId },
    })
    const company = customers?.[0]?.company ?? null
    if (!company || (company.status !== "active" && company.status !== "approved")) {
      return res.status(403).json({
        message: `Your company is ${company?.status || "not linked"}. Only approved companies can accept quotes.`,
      })
    }

    // ── 3. Validate quote status ───────────────────────────────────────
    if (quote.status !== "approved") {
      return res.status(409).json({
        message: `Quote status is "${quote.status}". Only approved quotes can be accepted.`,
      })
    }

    // ── 4. Check expiry ────────────────────────────────────────────────
    if (quote.expires_at && new Date(quote.expires_at) <= new Date()) {
      await service.updateQuotes({ id: quote.id, status: "expired" })
      return res.status(410).json({
        message: "Quote has expired. Please request a new quote.",
      })
    }

    // ── 5. Check if already has a cart ─────────────────────────────────
    if (quote.created_cart_id || quote.cart_id) {
      const existingCartId = quote.created_cart_id || quote.cart_id
      return res.json({
        message: "Quote already has a cart created.",
        cart_id: existingCartId,
        redirect_url: `/checkout?cart_id=${existingCartId}`,
      })
    }

    // ── 6. Validate negotiated items ───────────────────────────────────
    const negotiatedItems = quote.negotiated_items || quote.items
    if (!negotiatedItems || negotiatedItems.length === 0) {
      return res.status(422).json({
        message: "No negotiated items found. Admin must set negotiated prices first.",
      })
    }

    // Validate all items have a variant_id
    for (const item of negotiatedItems) {
      if (!item.variant_id) {
        return res.status(422).json({
          message: `Item "${item.title}" is missing a variant_id. Cannot add to cart.`,
        })
      }
    }

    // ── 7. Resolve region and sales channel ────────────────────────────
    const regionModule: any = req.scope.resolve(Modules.REGION)
    let regionId = (req.body as any)?.region_id
    if (!regionId) {
      const regions = await regionModule.listRegions({}, { take: 1 })
      regionId = regions?.[0]?.id
    }
    if (!regionId) {
      return res.status(422).json({ message: "No checkout region is configured" })
    }

    const salesChannelId = (req.body as any)?.sales_channel_id || null

    // ── 8. Build cart input with B2B context persistence ───────────────
    // The cart metadata embeds the full B2B context (company_id, company_name,
    // customer_type) to maintain company_id memory boundaries securely across
    // window routing pops. This ensures that after order completion, the
    // system stays active without crashing layout templates down to unlinked
    // states. The auth context tokens are preserved because the cart metadata
    // carries the B2B identity forward through the checkout flow.
    const cartItems = negotiatedItems.map((item: any) => {
      // Use negotiated_unit_price if available, otherwise use original requested_unit_price
      const unitPrice = item.negotiated_unit_price || item.requested_unit_price || 0
      return {
        variant_id: item.variant_id,
        quantity: item.quantity,
        metadata: {
          b2b_quote_id: quote.id,
          negotiated_unit_price: unitPrice,
          original_unit_price: item.current_calculated_unit_price || item.requested_unit_price || 0,
        },
      }
    })

    // Create cart with quote metadata — the B2B context is embedded in the
    // cart metadata so that post-purchase session persistence hooks can
    // retrieve the company_id without relying on ephemeral auth context.
    const { result: cart } = await createCartWorkflow(req.scope).run({
      input: {
        region_id: regionId,
        sales_channel_id: salesChannelId,
        customer_id: customerId,
        email: quote.customer_email,
        currency_code: quote.currency_code || "cad",
        metadata: {
          b2b_quote_id: quote.id,
          customer_type: "b2b",
          b2b_company_id: quote.company_id,
          b2b_company_name: quote.company_name,
          b2b_quote_accepted: true,
          // ── Post-Purchase Session Persistence ─────────────────────────
          // These fields are embedded to survive order completion. When the
          // order is fulfilled and the customer navigates back to the B2B
          // dashboard, the company_id is retrievable from the completed
          // order's metadata, preventing the layout from dropping to an
          // "unlinked" state.
          b2b_session_company_id: quote.company_id,
          b2b_session_company_name: quote.company_name,
          b2b_session_customer_id: customerId,
          b2b_session_persist: true,
        },
        items: cartItems,
      } as any,
    })

    // ── 9. Update quote status ─────────────────────────────────────────
    const updated = await service.updateQuotes({
      id: quote.id,
      status: "accepted",
      accepted_at: new Date().toISOString(),
      created_cart_id: cart.id,
      metadata: {
        ...(quote.metadata || {}),
        accepted_at: new Date().toISOString(),
        cart_created: true,
        cart_id: cart.id,
      },
    })

    console.log(
      `[B2B Quotes] Quote ${quote.id} accepted by customer ${customerId}. ` +
      `Cart ${cart.id} created. Redirecting to checkout. ` +
      `Company ${quote.company_id} persisted in cart metadata.`
    )

    // ── 10. Return response ────────────────────────────────────────────
    return res.status(201).json({
      message: "Quote accepted. Cart created.",
      quote: {
        id: updated.id,
        status: updated.status,
        accepted_at: updated.accepted_at,
        created_cart_id: updated.created_cart_id,
      },
      cart_id: cart.id,
      redirect_url: `/checkout?cart_id=${cart.id}`,
    })
  } catch (error: any) {
    console.error("[B2B Quotes] Accept error:", error)

    if (error instanceof MedusaError) {
      const status = error.type === "not_found" ? 404 :
        error.type === "not_allowed" ? 409 :
        error.type === "invalid_data" ? 422 : 400
      return res.status(status).json({ message: error.message })
    }

    return res.status(500).json({
      message: error.message || "Failed to accept quote",
    })
  }
}