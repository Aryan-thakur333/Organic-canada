/**
 * Standalone Integration Test: Admin Auth + Digital Product Flow
 *
 * Tests the complete flow:
 *   1. Register a new admin user
 *   2. Login with the registered credentials
 *   3. Create a digital product via multipart upload
 *   4. Verify the product exists in the admin API
 *   5. Test boundary conditions (missing fields, invalid prices)
 *
 * Usage:
 *   node test-admin-digital-flow.mjs
 *
 * Prerequisites:
 *   - Medusa backend running at http://localhost:9000
 *   - Start with: cd backend && npx medusa develop
 *
 * Exits with code 0 if all tests pass, 1 if any fail.
 */

const BASE = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const TEST_EMAIL = `admin-test-${Date.now()}@eatsie.test`
const TEST_PASSWORD = "DigitaT3st!"

// ── Coloured logging ────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function group(title) {
  console.log(`\n${"=".repeat(60)}`)
  console.log(`  ${title}`)
  console.log("=".repeat(60))
}

function ok(msg) {
  passed++
  console.log(`  ✅ ${msg}`)
}

function fail(msg, detail) {
  failed++
  console.log(`  ❌ ${msg}`)
  if (detail) console.log(`     ${typeof detail === "string" ? detail : JSON.stringify(detail, null, 4)}`)
}

function info(msg) {
  console.log(`  ℹ️  ${msg}`)
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function api(method, path, opts = {}) {
  const url = `${BASE}${path}`
  const options = {
    method,
    headers: opts.headers || {},
  }

  // For multipart, use the body as-is (FormData)
  // For JSON, stringify
  if (opts.formData) {
    // FormData body — fetch will set Content-Type automatically
    options.body = opts.formData
  } else if (opts.body !== undefined) {
    options.headers["Content-Type"] = "application/json"
    options.body = JSON.stringify(opts.body)
  }

  const res = await fetch(url, options)
  let data
  const contentType = res.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    data = await res.json()
  } else {
    data = await res.text()
  }

  return { status: res.status, headers: res.headers, data }
}

// ── Multipart helper using native FormData + Blob (Node 20+) ────────────────

function createMultipart(fields, fileField, fileBuffer, fileName) {
  const formData = new FormData()

  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, String(value))
  }

  if (fileBuffer && fileName) {
    const blob = new Blob([fileBuffer], { type: "application/octet-stream" })
    formData.append(fileField, blob, fileName)
  }

  return formData
}

// ═══════════════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function run() {
  console.log(`\n  Medusa Backend: ${BASE}`)
  console.log(`  Test email:     ${TEST_EMAIL}`)
  console.log(`  Started:        ${new Date().toISOString()}`)

  // ── Step 1: Server health check ─────────────────────────────────────────
  group("Step 1 — Server Health Check")

  try {
    const { status, data } = await api("GET", "/health")
    if (status === 200) {
      ok(`Server is running (uptime: ${data.uptime || "?"}s)`)
    } else {
      fail(`Server returned status ${status}`)
      console.log("\n  Start the server with: cd backend && npx medusa develop")
      process.exit(1)
    }
  } catch (err) {
    fail(`Cannot reach server: ${err.message}`)
    console.log("\n  Start the server with: cd backend && npx medusa develop")
    process.exit(1)
  }

  // ── Step 2: Admin Registration ──────────────────────────────────────────
  group("Step 2 — Admin Registration & Login")

  let adminToken

  // 2a. Register
  const regRes = await api("POST", "/auth/user/emailpass/register", {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })

  if (regRes.status === 200 && regRes.data?.token) {
    adminToken = regRes.data.token
    ok(`Admin registered: ${TEST_EMAIL}`)
  } else if (regRes.status === 409 || regRes.status === 422) {
    // User might already exist — try login instead
    info(`Registration returned ${regRes.status}: ${regRes.data?.message || "maybe exists"}`)
    const loginRes = await api("POST", "/auth/user/emailpass", {
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })
    if (loginRes.status === 200 && loginRes.data?.token) {
      adminToken = loginRes.data.token
      ok(`Logged in as existing user: ${TEST_EMAIL}`)
    } else {
      fail("Could not register or login", loginRes.data)
    }
  } else {
    fail("Admin registration failed", regRes.data)
  }

  // 2b. Login with correct credentials
  const loginRes = await api("POST", "/auth/user/emailpass", {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })

  if (loginRes.status === 200 && loginRes.data?.token) {
    adminToken = loginRes.data.token
    ok("Login returned valid JWT token")
  } else {
    fail("Login with valid credentials failed", loginRes.data)
  }

  // 2c. Login with wrong password
  const badLogin = await api("POST", "/auth/user/emailpass", {
    body: { email: TEST_EMAIL, password: "WrongPassword!" },
  })

  if (badLogin.status === 401) {
    ok("Wrong password correctly rejected (401)")
  } else {
    fail(`Expected 401 for wrong password, got ${badLogin.status}`, badLogin.data)
  }

  // ── Step 3: Digital Product Creation ────────────────────────────────────
  group("Step 3 — Create Digital Product via Multipart Upload")

  // 3a. Create with both EUR and USD
  const productTitle1 = `E-Book Gardening ${Date.now()}`
  const fileContent1 = Buffer.from("Sample PDF content for testing", "utf-8")

  const form1 = createMultipart(
    { title: productTitle1, price_eur: "19.99", price_usd: "24.99" },
    "file",
    fileContent1,
    "gardening-tips.pdf"
  )

  const createRes1 = await api("POST", "/admin/products/digital", {
    headers: { Authorization: `Bearer ${adminToken}` },
    formData: form1,
  })

  if (createRes1.status === 201) {
    ok("Digital product created with EUR + USD pricing")
    const r = createRes1.data
    console.log(`       Product: ${r.product.id} — ${r.product.title}`)
    console.log(`       Asset:   ${r.digital_asset.id} — ${r.digital_asset.file_name} (${r.digital_asset.file_size} bytes)`)

    // Validate response shape
    const checks = [
      ["type is 'success'", r.type === "success"],
      ["product.id is truthy", !!r.product.id],
      ["product.title matches", r.product.title === productTitle1],
      ["digital_asset.id starts with da_", r.digital_asset.id.startsWith("da_")],
      ["digital_asset.file_name is correct", r.digital_asset.file_name === "gardening-tips.pdf"],
      ["digital_asset.file_size is correct", r.digital_asset.file_size === fileContent1.length],
    ]
    for (const [label, check] of checks) {
      if (check) ok(`Response: ${label}`)
      else fail(`Response: ${label}`)
    }

    // 3b. Verify via admin product API
    const productId = r.product.id

    const prodRes = await api("GET", `/admin/products/${productId}?fields=id,title,status,*variants,*variants.prices`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    if (prodRes.status === 200 && prodRes.data?.product) {
      ok(`Product persisted and retrievable via admin API`)

      const product = prodRes.data.product
      if (product.title === productTitle1) ok("Product title persisted correctly")
      else fail("Product title mismatch", { expected: productTitle1, got: product.title })

      if (product.status === "published") ok("Product status is 'published'")
      else fail("Product status not 'published'", product.status)

      // Verify prices
      const variants = product.variants || []
      if (variants.length === 1 && variants[0].title === "Digital Download") {
        ok("Variant 'Digital Download' exists")
      } else {
        fail("Variant structure incorrect", variants)
      }

      const prices = variants[0]?.prices || []
      const eurPrice = prices.find(p => p.currency_code === "eur")
      const usdPrice = prices.find(p => p.currency_code === "usd")

      if (eurPrice) {
        // 19.99 EUR → 1999 cents
        if (eurPrice.amount === 1999) ok("EUR price is 1999 cents (€19.99)")
        else fail(`EUR price mismatch`, { expected: 1999, got: eurPrice.amount })
      } else {
        fail("EUR price not found on variant")
      }

      if (usdPrice) {
        if (usdPrice.amount === 2499) ok("USD price is 2499 cents ($24.99)")
        else fail(`USD price mismatch`, { expected: 2499, got: usdPrice.amount })
      } else {
        fail("USD price not found on variant")
      }
    } else {
      fail("Could not retrieve persisted product", prodRes.data)
    }

    // 3c. Check product appears in list
    const listRes = await api("GET", `/admin/products?q=Gardening&limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    if (listRes.status === 200) {
      const found = (listRes.data?.products || []).find(p => p.id === productId)
      if (found) ok("Product appears in admin product list")
      else fail("Product not found in admin product list")
    } else {
      fail("Failed to list admin products", listRes.data)
    }
  } else {
    fail("Digital product creation failed", createRes1.data)
  }

  // ── Step 4: Validation & Edge Cases ─────────────────────────────────────
  group("Step 4 — Validation & Edge Cases")

  // 4a. Missing title
  const noTitleForm = createMultipart(
    { price_eur: "9.99" },
    "file", Buffer.from("x"), "x.pdf"
  )
  const noTitleRes = await api("POST", "/admin/products/digital", {
    headers: { Authorization: `Bearer ${adminToken}` },
    formData: noTitleForm,
  })
  if (noTitleRes.status === 400 && noTitleRes.data?.message?.toLowerCase().includes("title")) {
    ok("Missing title → 400")
  } else {
    fail(`Missing title: expected 400, got ${noTitleRes.status}`, noTitleRes.data)
  }

  // 4b. Missing file
  const noFileForm = createMultipart(
    { title: "No File", price_usd: "14.99" },
    "file", null, null
  )
  const noFileRes = await api("POST", "/admin/products/digital", {
    headers: { Authorization: `Bearer ${adminToken}` },
    formData: noFileForm,
  })
  if (noFileRes.status === 400 && noFileRes.data?.message?.toLowerCase().includes("file")) {
    ok("Missing file → 400")
  } else {
    fail(`Missing file: expected 400, got ${noFileRes.status}`, noFileRes.data)
  }

  // 4c. No price
  const noPriceForm = createMultipart(
    { title: "No Price" },
    "file", Buffer.from("data"), "data.dat"
  )
  const noPriceRes = await api("POST", "/admin/products/digital", {
    headers: { Authorization: `Bearer ${adminToken}` },
    formData: noPriceForm,
  })
  if (noPriceRes.status === 400 && noPriceRes.data?.message?.toLowerCase().includes("price")) {
    ok("Missing both prices → 400")
  } else {
    fail(`Missing prices: expected 400, got ${noPriceRes.status}`, noPriceRes.data)
  }

  // 4d. Negative price
  const negPriceForm = createMultipart(
    { title: "Neg Price", price_eur: "-5.00" },
    "file", Buffer.from("neg"), "neg.pdf"
  )
  const negPriceRes = await api("POST", "/admin/products/digital", {
    headers: { Authorization: `Bearer ${adminToken}` },
    formData: negPriceForm,
  })
  if (negPriceRes.status === 400) {
    ok("Negative price → 400")
  } else {
    fail(`Negative price: expected 400, got ${negPriceRes.status}`, negPriceRes.data)
  }

  // 4e. Non-numeric price
  const badPriceForm = createMultipart(
    { title: "Bad Price", price_eur: "not-a-number", price_usd: "also-bad" },
    "file", Buffer.from("bad"), "bad.pdf"
  )
  const badPriceRes = await api("POST", "/admin/products/digital", {
    headers: { Authorization: `Bearer ${adminToken}` },
    formData: badPriceForm,
  })
  if (badPriceRes.status === 400) {
    ok("Non-numeric prices → 400")
  } else {
    fail(`Non-numeric prices: expected 400, got ${badPriceRes.status}`, badPriceRes.data)
  }

  // 4f. Unauthenticated request
  const noAuthForm = createMultipart(
    { title: "No Auth", price_eur: "9.99" },
    "file", Buffer.from("x"), "x.pdf"
  )
  const noAuthRes = await api("POST", "/admin/products/digital", {
    formData: noAuthForm,
  })
  if (noAuthRes.status === 401) {
    ok("Unauthenticated request → 401")
  } else {
    fail(`No auth: expected 401, got ${noAuthRes.status}`, noAuthRes.data)
  }

  // 4g. Empty title
  const emptyTitleForm = createMultipart(
    { title: "", price_eur: "9.99" },
    "file", Buffer.from("x"), "x.pdf"
  )
  const emptyTitleRes = await api("POST", "/admin/products/digital", {
    headers: { Authorization: `Bearer ${adminToken}` },
    formData: emptyTitleForm,
  })
  if (emptyTitleRes.status === 400) {
    ok("Empty title → 400")
  } else {
    fail(`Empty title: expected 400, got ${emptyTitleRes.status}`, emptyTitleRes.data)
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  group("Results Summary")

  const total = passed + failed
  console.log(`  Total:  ${total}`)
  console.log(`  Passed: ${passed} ✅`)
  console.log(`  Failed: ${failed} ❌`)

  if (failed > 0) {
    console.log(`\n  ❌ Some tests failed. Review the errors above.`)
    process.exit(1)
  } else {
    console.log(`\n  ✅ All tests passed!`)
    console.log(`\n  Credentials used:`)
    console.log(`    Email:    ${TEST_EMAIL}`)
    console.log(`    Password: ${TEST_PASSWORD}`)
    process.exit(0)
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
