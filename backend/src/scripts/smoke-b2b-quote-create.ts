import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { B2B_MODULE } from "../modules/b2b/index.js"

async function postJson(url: string, body: Record<string, any>, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(`${response.status} ${url}: ${JSON.stringify(data)}`)
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
        salesChannelsData: [{ name: "B2B Quote Smoke Channel" }],
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
          title: "B2B quote smoke publishable key",
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

export default async function smokeB2BQuoteCreate({ container }: ExecArgs) {
  const baseUrl = process.env.BACKEND_URL || "http://localhost:9000"
  const token = await createPublishableKey(container)
  const stamp = Date.now()
  const email = `b2b-smoke-${stamp}@eatsie.test`
  const password = "Password123!"
  const publishableHeaders = { "x-publishable-api-key": token }

  const auth = await postJson(`${baseUrl}/auth/customer/emailpass/register`, {
    email,
    password,
  })
  if (!auth.token) {
    throw new Error(`Auth registration did not return a token. Keys: ${Object.keys(auth).join(", ")}`)
  }
  const registrationHeaders = {
    ...publishableHeaders,
    Authorization: `Bearer ${auth.token}`,
  }

  await postJson(
    `${baseUrl}/store/customers`,
    { email, first_name: "B2B", last_name: "Smoke" },
    registrationHeaders
  )
  const login = await postJson(`${baseUrl}/auth/customer/emailpass`, {
    email,
    password,
  })
  const authHeaders = {
    ...publishableHeaders,
    Authorization: `Bearer ${login.token}`,
  }
  const companyResponse = await postJson(
    `${baseUrl}/store/b2b/company`,
    {
      company_name: "B2B Smoke Co",
      tax_id: `TAX-${stamp}`,
      credit_limit: 100000,
    },
    authHeaders
  )

  const b2bService: any = container.resolve(B2B_MODULE)
  await b2bService.updateCompanies({
    id: companyResponse.company.id,
    status: "approved",
    approved_credit_limit: 100000,
    approved_at: new Date(),
    admin_note: "Auto-approved for B2B quote create smoke test",
  })

  const quoteResponse = await postJson(
    `${baseUrl}/store/b2b/quotes`,
    {
      currency_code: "cad",
      items: [
        { title: "Fresh Bananas", sku: "EATSIE-FRESH", quantity: 100, unit_price: 0.02 },
        { title: "Audit Test Product", sku: "AUDIT-TEST", quantity: 123, unit_price: 0.06 },
      ],
    },
    authHeaders
  )

  const quote = quoteResponse.quote
  const itemTotals = (quote.requested_items || []).map((item: any) => item.line_total)
  if (quote.requested_total !== 938 || itemTotals[0] !== 200 || itemTotals[1] !== 738) {
    throw new Error(`Unexpected quote totals: ${JSON.stringify({ total: quote.requested_total, itemTotals })}`)
  }

  console.log(
    `[B2B_QUOTE_CREATE_SMOKE_DONE] status=${quote.status} quote_id=${quote.id} total=${quote.requested_total} display=9.38`
  )
}
