const PAYPAL_API_BASE =
  process.env.PAYPAL_API_BASE ||
  (process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com")

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
}

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required for PayPal quote payments")
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })

  if (!response.ok) {
    throw new Error(`PayPal token request failed with ${response.status}`)
  }

  const data = await response.json()
  return data.access_token
}

export async function createPayPalOrder(input: {
  amount: string
  currency_code: string
  idempotency_key: string
  metadata: Record<string, string>
}) {
  const accessToken = await getPayPalAccessToken()
  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": input.idempotency_key,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: input.currency_code.toUpperCase(),
            value: input.amount,
          },
          custom_id: input.metadata.quote_id,
          invoice_id: input.metadata.invoice_id,
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`PayPal create order failed with ${response.status}`)
  }

  return await response.json()
}

export async function capturePayPalOrder(orderId: string) {
  const accessToken = await getPayPalAccessToken()
  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`PayPal capture failed with ${response.status}`)
  }

  return await response.json()
}
