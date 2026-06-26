import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_MODULE } from "../../../../modules/b2b"
import { Modules, MedusaError } from "@medusajs/framework/utils"

// ── Types ──────────────────────────────────────────────────────────────────

type QuoteLineItem = {
  product_id?: string
  variant_id?: string
  title: string
  sku?: string
  quantity: number
  unit_price: number
}

type QuoteRequestBody = {
  /** Array of line items the customer wants quoted */
  items: QuoteLineItem[]
  /** Optional notes or context for the admin reviewer */
  notes?: string
}

// ────────────────────────────────────────────────────────────────────────────
//  GET /store/b2b/quotes
//
//  Returns the authenticated customer's own quote requests, ordered by
//  creation date descending (most recent first).
//
//  Query params:
//    - status : optional filter (draft, pending, approved, rejected, converted)
//    - offset : pagination offset (default 0)
//    - limit  : pagination limit (default 50, max 100)
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as any).auth_context
  const customerId: string | null = authContext?.actor_id ?? null

  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)

    const { status, offset, limit } = req.query as Record<string, string | undefined>

    const filters: Record<string, any> = { customer_id: customerId }
    if (status) filters.status = status

    const skip = Math.max(0, parseInt(offset || "0", 10) || 0)
    const take = Math.min(Math.max(1, parseInt(limit || "50", 10) || 50), 100)

    const [quotes, count] = await b2bService.listAndCountQuotes(filters, {
      skip,
      take,
      order: { created_at: "DESC" },
    })

    console.log(
      `[B2B Quotes] Customer ${customerId} listed their quotes: ${count} total`
    )

    return res.json({
      quotes: quotes.map((q: any) => ({
        id: q.id,
        company_id: q.company_id,
        customer_id: q.customer_id,
        customer_email: q.customer_email,
        status: q.status,
        items: q.items,
        subtotal: q.subtotal,
        negotiated_total: q.negotiated_total,
        total: q.total,
        currency_code: q.currency_code,
        discount_total: q.discount_total,
        customer_note: q.customer_note,
        company_name: q.company_name,
        customer_name: q.customer_name,
        expires_at: q.expires_at,
        cart_id: q.cart_id,
        order_id: q.order_id,
        admin_notes: q.admin_notes,
        created_at: q.created_at,
        updated_at: q.updated_at,
      })),
      count,
      offset: skip,
      limit: take,
    })
  } catch (error: any) {
    console.error("[B2B Quotes] List error:", error)

    if (error instanceof MedusaError) {
      return res.status(error.type === "not_found" ? 404 : 400).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to list quotes" })
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  POST /store/b2b/quotes
//
//  Allows an authenticated B2B customer to submit a wholesale quote request.
//  The route:
//    1. Authenticates the customer via session
//    2. Resolves the customer's linked B2B Company via Remote Query
//    3. Validates the items payload
//    4. Computes the subtotal from line item totals
//    5. Creates a 'draft' Quote record linked to the company
//    6. Returns the created quote
//
//  The quote enters the admin review pipeline:
//    GET  /admin/b2b-quotes        — admin lists pending drafts
//    POST /admin/b2b-quotes/:id/review — admin approves/rejects
//
//  Request body:
//    {
//      "items": [
//        { "product_id": "prod_01J...", "title": "Organic Apple Box",
//          "sku": "ORG-APP-12", "quantity": 20, "unit_price": 1500 }
//      ],
//      "notes": "Need bulk pricing for our weekly farm-to-table event."
//    }
// ────────────────────────────────────────────────────────────────────────────
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as any).auth_context
  const customerId: string | null = authContext?.actor_id ?? null

  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const { items, notes } = req.body as QuoteRequestBody

  // ── 1. Validate the request body ─────────────────────────────────────
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "At least one line item is required",
    })
  }

  for (const [i, item] of items.entries()) {
    if (!item.title || typeof item.title !== "string") {
      return res.status(400).json({
        message: `Item at index ${i} is missing a valid 'title'`,
      })
    }
    if (typeof item.quantity !== "number" || item.quantity < 1 || !Number.isInteger(item.quantity)) {
      return res.status(400).json({
        message: `Item at index ${i} has an invalid 'quantity' — must be a positive integer`,
      })
    }
    if (typeof item.unit_price !== "number" || item.unit_price < 0) {
      return res.status(400).json({
        message: `Item at index ${i} has an invalid 'unit_price' — must be a non-negative number (cents)`,
      })
    }
  }

  try {
    const b2bService: any = req.scope.resolve(B2B_MODULE)
    const customerModule: any = req.scope.resolve(Modules.CUSTOMER)
    const query = req.scope.resolve("query")

    // ── 2. Resolve the authenticated customer ───────────────────────────
    const customer = await customerModule.retrieveCustomer(customerId)
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" })
    }

    // ── 3. Resolve the customer's linked B2B Company via Remote Query ───
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: [
        "company.id",
        "company.company_name",
        "company.status",
      ],
      filters: { id: customerId },
    })

    const company = customers?.[0]?.company ?? null

    if (!company) {
      return res.status(400).json({
        message:
          "No B2B company linked to your account. " +
          "Please register your company at /store/b2b/company first.",
      })
    }

    if (company.status !== "active") {
      return res.status(403).json({
        message: `Your company is ${company.status}. Only active companies can submit quote requests.`,
      })
    }

    // ── 4. Compute totals from line items ───────────────────────────────
    const itemsWithTotals = items.map((item) => ({
      product_id: item.product_id || null,
      variant_id: item.variant_id || null,
      title: item.title,
      sku: item.sku || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.quantity * item.unit_price,
    }))

    const subtotal = itemsWithTotals.reduce((sum, item) => sum + item.total, 0)

    // ── 5. Create the draft quote record ─────────────────────────────────
    const quote = await b2bService.createQuotes({
      company_id: company.id,
      customer_id: customerId,
      customer_email: customer.email || "",
      status: "pending_review",
      customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
      company_name: company.company_name,
      currency_code: "cad",
      items: itemsWithTotals,
      subtotal,
      negotiated_total: null,
      discount_total: 0,
      total: subtotal,
      admin_notes: null,
      customer_note: notes || null,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      metadata: {
        customer_name:
          [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
        submitted_by: customerId,
        submitted_at: new Date().toISOString(),
      },
    })

    console.log(
      `[B2B Quotes] Draft quote ${quote.id} created for customer ${customer.email} ` +
        `(company: ${company.company_name || company.id}, items: ${items.length}, subtotal: ${subtotal})`
    )

    // ── 6. Return the created quote ─────────────────────────────────────
    return res.status(201).json({
      message: "Wholesale quote request submitted successfully",
      quote: {
        id: quote.id,
        company_id: quote.company_id,
        customer_id: quote.customer_id,
        customer_email: quote.customer_email,
        status: quote.status,
        items: quote.items,
        subtotal: quote.subtotal,
        admin_notes: quote.admin_notes,
        created_at: quote.created_at,
      },
    })
  } catch (error: any) {
    console.error("[B2B Quotes] Submit error:", error)

    if (error instanceof MedusaError) {
      const status = error.type === "not_found" ? 404 : 400
      return res.status(status).json({ message: error.message })
    }

    return res.status(500).json({
      message: error.message || "Failed to submit wholesale quote request",
    })
  }
}
