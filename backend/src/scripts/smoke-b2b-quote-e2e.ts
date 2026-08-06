import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  createUserAccountWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { B2B_MODULE } from "../modules/b2b/index.js"

async function requestJson(
  method: "GET" | "POST" | "PATCH",
  url: string,
  body?: Record<string, any>,
  headers: Record<string, string> = {}
) {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${JSON.stringify(data)}`)
  }

  return data
}

async function createPublishableKey(container: any) {
  const query: any = container.resolve("query")
  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
    pagination: { take: 1 },
  })

  let salesChannelId = salesChannels?.[0]?.id
  if (!salesChannelId) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [{ name: "B2B Quote E2E Smoke Channel" }],
      },
    })
    salesChannelId = result[0].id
  }

  const {
    result: [apiKey],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "B2B quote e2e smoke publishable key",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  })

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: apiKey.id,
      add: [salesChannelId],
    },
  })

  return apiKey.token
}

async function createAdminToken(container: any, baseUrl: string, stamp: number) {
  const email = `b2b-e2e-admin-${stamp}@eatsie.test`
  const password = "AdminPass123!"
  const authService: any = container.resolve(Modules.AUTH)
  const registration = await authService.register("emailpass", {
    body: { email, password },
  })

  if (!registration.success || !registration.authIdentity?.id) {
    throw new Error(`Admin auth registration failed for ${email}`)
  }

  await createUserAccountWorkflow(container).run({
    input: {
      authIdentityId: registration.authIdentity.id,
      userData: {
        email,
        first_name: "B2B",
        last_name: "E2E",
      },
    },
  })

  const login = await requestJson("POST", `${baseUrl}/auth/user/emailpass`, {
    email,
    password,
  })

  return login.token as string
}

export default async function smokeB2BQuoteE2E({ container }: ExecArgs) {
  const baseUrl = process.env.BACKEND_URL || "http://localhost:9000"
  const stamp = Date.now()
  const publishableKey = await createPublishableKey(container)
  const publishableHeaders = { "x-publishable-api-key": publishableKey }

  const customerEmail = `b2b-e2e-customer-${stamp}@eatsie.test`
  const customerPassword = "Password123!"
  const registration = await requestJson("POST", `${baseUrl}/auth/customer/emailpass/register`, {
    email: customerEmail,
    password: customerPassword,
  })
  await requestJson(
    "POST",
    `${baseUrl}/store/customers`,
    { email: customerEmail, first_name: "B2B", last_name: "E2E" },
    {
      ...publishableHeaders,
      Authorization: `Bearer ${registration.token}`,
    }
  )

  const customerLogin = await requestJson("POST", `${baseUrl}/auth/customer/emailpass`, {
    email: customerEmail,
    password: customerPassword,
  })
  const customerHeaders = {
    ...publishableHeaders,
    Authorization: `Bearer ${customerLogin.token}`,
  }

  const companyResponse = await requestJson(
    "POST",
    `${baseUrl}/store/b2b/company`,
    {
      company_name: "B2B E2E Smoke Co",
      tax_id: `TAX-${stamp}`,
      requested_credit_limit: 1000,
    },
    customerHeaders
  )

  const b2bService: any = container.resolve(B2B_MODULE)
  await b2bService.updateCompanies({
    id: companyResponse.company.id,
    status: "approved",
    approved_credit_limit: 100000,
    approved_at: new Date(),
    admin_note: "Auto-approved for B2B quote E2E smoke test",
  })

  const adminToken = await createAdminToken(container, baseUrl, stamp)
  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
  }

  const createQuote = await requestJson(
    "POST",
    `${baseUrl}/store/b2b/quotes`,
    {
      currency_code: "cad",
      items: [
        { title: "Fresh Bananas", sku: "EATSIE-FRESH", quantity: 100, unit_price: 0.02 },
        { title: "Audit Test Product", sku: "AUDIT-TEST", quantity: 123, unit_price: 0.06 },
      ],
    },
    customerHeaders
  )
  const quoteId = createQuote.quote.id
  if (createQuote.quote.requested_total !== 938) {
    throw new Error(`Expected requested_total 938, received ${createQuote.quote.requested_total}`)
  }

  const negotiated = await requestJson(
    "PATCH",
    `${baseUrl}/admin/b2b-quotes/${quoteId}/negotiated-total`,
    {
      negotiated_total: 8.88,
      expires_at: "2099-12-31",
      payment_terms: "net_15",
      admin_note: "E2E final offer",
    },
    adminHeaders
  )
  if (negotiated.quote.negotiated_total !== 888) {
    throw new Error(`Expected negotiated_total 888, received ${negotiated.quote.negotiated_total}`)
  }

  const sent = await requestJson(
    "POST",
    `${baseUrl}/admin/b2b-quotes/${quoteId}/send`,
    { admin_note: "E2E offer ready" },
    adminHeaders
  )

  const accepted = await requestJson(
    "POST",
    `${baseUrl}/store/b2b/quotes/${quoteId}/accept`,
    {
      offer_version: sent.quote.offer_version,
      settlement_mode: "online",
    },
    customerHeaders
  )
  if (accepted.quote.payment_state !== "payment_required") {
    throw new Error(`Expected payment_required after accept, received ${accepted.quote.payment_state}`)
  }

  const options = await requestJson(
    "GET",
    `${baseUrl}/store/b2b/quotes/${quoteId}/payment-options`,
    undefined,
    customerHeaders
  )
  const invoiceOption = options.providers?.find((provider: any) => provider.id === "invoice")
  if (!invoiceOption?.enabled) {
    throw new Error("Invoice payment option was not enabled")
  }

  const paymentReference = `E2E-${stamp}`
  const invoice = await requestJson(
    "POST",
    `${baseUrl}/store/b2b/quotes/${quoteId}/payments/invoice`,
    { reference: paymentReference },
    customerHeaders
  )
  if (invoice.payment_state !== "awaiting_remittance") {
    throw new Error(`Expected awaiting_remittance, received ${invoice.payment_state}`)
  }

  const instructions = await requestJson(
    "GET",
    `${baseUrl}/store/b2b/quotes/${quoteId}/payment-instructions`,
    undefined,
    customerHeaders
  )
  if (instructions.amount !== 888 || !String(instructions.instructions).includes(paymentReference)) {
    throw new Error(`Unexpected payment instructions: ${JSON.stringify(instructions)}`)
  }

  const paid = await requestJson(
    "POST",
    `${baseUrl}/admin/b2b-quotes/${quoteId}/mark-payment-received`,
    {
      payment_reference: paymentReference,
      amount_received: 8.88,
      note: "E2E offline remittance received",
    },
    adminHeaders
  )
  if (paid.quote.payment_state !== "paid" || !paid.quote.paid_at) {
    throw new Error(`Quote was not marked paid: ${JSON.stringify(paid.quote)}`)
  }

  console.log(
    `[B2B_QUOTE_E2E_SMOKE_DONE] quote_id=${quoteId} order_id=${accepted.order.id} original=938 negotiated=888 final_state=${paid.quote.payment_state}`
  )
}
