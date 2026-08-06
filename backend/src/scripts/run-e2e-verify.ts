import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import pg from "pg"
import { ulid } from "ulid"

const BACKEND_URL = "http://localhost:9000"
const PUBLISHABLE_KEY = "pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491"

async function api(method: string, endpoint: string, body?: any, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (endpoint.startsWith("/store/")) {
    headers["x-publishable-api-key"] = PUBLISHABLE_KEY
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  let data: any = null
  try {
    data = await res.json()
  } catch {}

  return { status: res.status, data }
}

export default async function runE2EVerify({ container }) {
  console.log("=== Starting Automated E2E Verification Setup ===")

  // 1. Ensure digital file on disk
  const STORAGE_DIR = path.join(process.cwd(), "uploads", "digital")
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true })
  }
  fs.writeFileSync(path.join(STORAGE_DIR, "verify.pdf"), "Verification PDF Content")
  console.log("✓ Digital asset file verify.pdf created on disk")

  // 2. Resolve Region
  const regionService = container.resolve(Modules.REGION)
  const regions = await regionService.listRegions({}, { take: 1 })
  const region = regions[0]
  if (!region) {
    throw new Error("No region found in database to link order")
  }
  console.log(`✓ Resolved Region: ${region.name} (${region.id})`)

  // 3. Create or Resolve Digital Product
  const productService = container.resolve(Modules.PRODUCT)
  let product = (await productService.listProducts({ title: "Verification E-Book" }, { take: 1 }))[0]
  if (!product) {
    product = await productService.createProducts({
      title: "Verification E-Book",
      status: "published",
      metadata: {
        is_digital: true,
        download_assets: [
          {
            id: "asset_verify",
            storage_key: "uploads/digital/verify.pdf",
            filename: "verify.pdf",
            mime_type: "application/pdf",
            file_size: 100,
          }
        ]
      },
      variants: [
        {
          title: "Digital Download",
          sku: "DIGITAL-VERIFY",
          metadata: {
            is_digital: true,
          }
        }
      ]
    })
  }

  // Fetch full product with variants
  product = (await productService.listProducts({ id: product.id }, { relations: ["variants"], take: 1 }))[0]
  const variant = product.variants?.[0]
  if (!variant) {
    throw new Error("Product variant is missing")
  }
  console.log(`✓ Resolved Digital Product: ${product.title} (Variant: ${variant.id})`)

  // 4. Admin Login
  console.log("Logging in as admin...")
  const adminAuthRes = await api("POST", "/auth/user/emailpass", {
    email: "admin@eatsie.com",
    password: "Password123!",
  })
  const adminToken = adminAuthRes.data?.token
  if (!adminToken) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminAuthRes.data)}`)
  }
  console.log("✓ Admin logged in")

  // 5. Register and login Digital Customer
  const custEmail = `cust-verify-${Date.now()}@eatsie.test`
  console.log(`Registering customer: ${custEmail}`)
  const regRes = await api("POST", "/auth/customer/emailpass/register", {
    email: custEmail,
    password: "Password123!",
  })
  let customerToken = regRes.data?.token
  if (!customerToken) {
    throw new Error(`Customer auth registration failed: ${JSON.stringify(regRes.data)}`)
  }

  const profileRes = await api("POST", "/store/customers", {
    email: custEmail,
    first_name: "Digital",
    last_name: "Verifier",
  }, customerToken)
  const customerId = profileRes.data?.customer?.id || profileRes.data?.id
  if (!customerId) {
    throw new Error(`Customer profile creation failed: ${JSON.stringify(profileRes.data)}`)
  }

  const loginRes = await api("POST", "/auth/customer/emailpass", {
    email: custEmail,
    password: "Password123!",
  })
  customerToken = loginRes.data?.token
  console.log(`✓ Customer registered and logged in. Customer ID: ${customerId}`)

  // 6. Create Digital Order for Customer
  console.log("Creating digital order...")
  const orderModuleService = container.resolve(Modules.ORDER)
  const order = await orderModuleService.createOrders({
    email: custEmail,
    customer_id: customerId,
    currency_code: "cad",
    region_id: region.id,
    total: 1000,
    payment_status: "captured",
    status: "completed",
    items: [
      {
        title: "Verification E-Book",
        quantity: 1,
        unit_price: 1000,
        product_id: product.id,
        variant_id: variant.id,
      }
    ]
  })

  // Create a payment collection, session, payment, and link directly in database via SQL to mock a completed payment
  try {
    const DB_URL = process.env.DATABASE_URL || "postgres://postgres:9426695327@localhost:5432/medusa-backend"
    const client = new pg.Client({ connectionString: DB_URL })
    await client.connect()

    const payColId = `pay_col_${ulid()}`
    const paySesId = `payses_${ulid()}`
    const payId = `pay_${ulid()}`
    const linkId = `ordpay_${ulid()}`

    // 1. Insert into payment_collection
    await client.query(`
      INSERT INTO payment_collection (id, currency_code, amount, raw_amount, authorized_amount, raw_authorized_amount, captured_amount, raw_captured_amount, refunded_amount, raw_refunded_amount, status, created_at, updated_at)
      VALUES ($1, 'cad', 1000, '{"amount":1000}'::jsonb, 1000, '{"amount":1000}'::jsonb, 1000, '{"amount":1000}'::jsonb, 0, '{"amount":0}'::jsonb, 'completed', NOW(), NOW())
    `, [payColId])

    // 2. Insert into payment_session
    await client.query(`
      INSERT INTO payment_session (id, currency_code, amount, raw_amount, provider_id, status, payment_collection_id, data, created_at, updated_at)
      VALUES ($1, 'cad', 1000, '{"amount":1000}'::jsonb, 'pp_system_default', 'authorized', $2, '{"status":"succeeded","amount_received":1000}'::jsonb, NOW(), NOW())
    `, [paySesId, payColId])

    // 3. Insert into payment
    await client.query(`
      INSERT INTO payment (id, amount, raw_amount, currency_code, provider_id, data, captured_at, payment_collection_id, payment_session_id, created_at, updated_at)
      VALUES ($1, 1000, '{"amount":1000}'::jsonb, 'cad', 'pp_system_default', '{"status":"succeeded","amount_received":1000}'::jsonb, NOW(), $2, $3, NOW(), NOW())
    `, [payId, payColId, paySesId])

    // 4. Insert into order_payment_collection
    await client.query(`
      INSERT INTO order_payment_collection (id, order_id, payment_collection_id, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [linkId, order.id, payColId])

    // 5. Update order payment status
    await client.query(`
      UPDATE "order" SET payment_status = 'captured' WHERE id = $1
    `, [order.id])

    await client.end()
    console.log("✓ Linked and fully captured mock payment collection to order via SQL")
  } catch (payErr: any) {
    console.error("Payment SQL mock insert failed:", payErr.message)
  }

  console.log(`✓ Mock paid order created: ${order.id}`)

  // 7. Register and login B2B Customer
  const b2bEmail = `b2b-verify-${Date.now()}@eatsie.test`
  console.log(`Registering B2B customer: ${b2bEmail}`)
  const regB2BRes = await api("POST", "/auth/customer/emailpass/register", {
    email: b2bEmail,
    password: "Password123!",
  })
  let b2bToken = regB2BRes.data?.token
  if (!b2bToken) {
    throw new Error(`B2B Customer auth registration failed: ${JSON.stringify(regB2BRes.data)}`)
  }

  const profileB2BRes = await api("POST", "/store/customers", {
    email: b2bEmail,
    first_name: "B2B",
    last_name: "Verifier",
  }, b2bToken)
  const b2bCustomerId = profileB2BRes.data?.customer?.id || profileB2BRes.data?.id

  const loginB2BRes = await api("POST", "/auth/customer/emailpass", {
    email: b2bEmail,
    password: "Password123!",
  })
  b2bToken = loginB2BRes.data?.token
  console.log(`✓ B2B Customer registered and logged in. Customer ID: ${b2bCustomerId}`)

  // 8. Register B2B Company
  console.log("Registering B2B company...")
  const compRes = await api("POST", "/store/b2b/company", {
    company_name: `Verify B2B Company ${Date.now()}`,
    tax_id: `TAX-VERIFY-${Date.now()}`,
  }, b2bToken)
  const company = compRes.data?.company
  if (!company?.id) {
    throw new Error(`Company registration failed: ${JSON.stringify(compRes.data)}`)
  }
  console.log(`✓ B2B Company created: ${company.company_name} (${company.id})`)

  // 9. Approve B2B Company as Admin
  console.log("Approving B2B company...")
  const approveRes = await api("POST", `/admin/b2b/companies/${company.id}/approve`, {
    approved_credit_limit: 5000,
    admin_note: "Auto-approved for verification",
  }, adminToken)
  if (approveRes.status !== 200) {
    throw new Error(`B2B Company approval failed: ${JSON.stringify(approveRes.data)}`)
  }
  console.log("✓ B2B Company approved")

  // 10. Run Backfill Script
  console.log("Running backfill script to link download records...")
  const backfillResult = execSync("npx medusa exec ./src/scripts/backfill-digital-downloads.ts", {
    encoding: "utf-8",
  })
  console.log(backfillResult)
  console.log("✓ Backfill script completed")

  // 11. Run Verification Script with env variables
  console.log("Running verification script...")
  try {
    const runVerification = execSync("node scripts/verify-authenticated-digital-b2b.mjs", {
      env: {
        ...process.env,
        CUSTOMER_TOKEN: customerToken,
        B2B_TOKEN: b2bToken,
      },
      encoding: "utf-8",
    })
    console.log(runVerification)
    console.log("🎉 Verification script completed successfully!")
  } catch (err: any) {
    console.error("❌ Verification script failed:")
    console.error(err.stdout || err.message)
    throw err
  }
}
