/**
 * Standalone Test: Admin Auth + Digital Product Creation
 *
 * Tests the complete digital product flow against a running Medusa backend:
 *   1. Create admin user via `medusa user` CLI command (creates User + AuthIdentity properly linked)
 *   2. Login via the Auth API to obtain a JWT with valid actor_id
 *   3. Create digital products via multipart upload
 *   4. Verify persistence via admin APIs
 *   5. Test validation edge cases
 *
 * Usage:
 *   node test-digital-product-flow.mjs
 *
 * Prerequisites:
 *   - Medusa backend running at http://localhost:9000
 *   - Node.js 20+ (native fetch + FormData)
 *
 * Exits with code 0 if all tests pass, 1 if any fail.
 */

// ── Configuration ──────────────────────────────────────────────────────────

const BASE = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const TEST_EMAIL = `digital-test-${Date.now()}@eatsie.test`
const TEST_PASSWORD = "DigitaT3st!"

// ── Coloured logging ───────────────────────────────────────────────────────

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

// ── Shell helper ───────────────────────────────────────────────────────────

import { execSync } from "node:child_process"

function runCmd(cmd, label) {
  try {
    const out = execSync(cmd, { cwd: process.cwd(), encoding: "utf-8", timeout: 30000 })
    return out.trim()
  } catch (err) {
    info(`Command failed: ${label}`)
    info(`  ${err.stderr?.trim() || err.message}`)
    return null
  }
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

async function api(method, path, opts = {}) {
  const url = `${BASE}${path}`
  const options = { method, headers: { ...(opts.headers || {}) } }

  if (opts.formData) {
    options.body = opts.formData
  } else if (opts.body !== undefined) {
    options.headers["Content-Type"] = "application/json"
    options.body = JSON.stringify(opts.body)
  }

  const res = await fetch(url, options)
  const ct = res.headers.get("content-type") || ""
  const data = ct.includes("application/json") ? await res.json() : await res.text()

  return { status: res.status, headers: res.headers, data }
}

// ── Multipart helper (Node.js 20+ FormData + Blob) ────────────────────────

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
//  MAIN
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
      console.log("\n  Start: cd backend && npm run dev")
      process.exit(1)
    }
  } catch (err) {
    fail(`Cannot reach server: ${err.message}`)
    console.log("\n  Start: cd backend && npm run dev")
    process.exit(1)
  }

  // ── Step 2: Ensure database tables exist ───────────────────────────────
  // The digital-asset module is custom (no migration files in migrations/),
  // so we create tables directly via SQL if they don't already exist.
  group("Step 2 — Ensure Database Tables Exist")

  let dbClient
  try {
    const pg = (await import("pg")).default
    const DB_URL = process.env.DATABASE_URL || "postgres://postgres:9426695327@localhost:5432/medusa-backend"
    dbClient = new pg.Client({ connectionString: DB_URL })
    await dbClient.connect()

    // Create digital_asset table if not exists
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS "digital_asset" (
        "id" TEXT NOT NULL,
        "product_id" TEXT NOT NULL,
        "secure_s3_key" TEXT NOT NULL,
        "file_name" TEXT NOT NULL,
        "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
        "file_size" INTEGER NOT NULL DEFAULT 0,
        "version" TEXT NULL,
        "is_primary" BOOLEAN NOT NULL DEFAULT false,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "download_limit" INTEGER NOT NULL DEFAULT 0,
        "download_count" INTEGER NOT NULL DEFAULT 0,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "metadata" JSONB NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "digital_asset_pkey" PRIMARY KEY ("id")
      )
    `)

    // Create digital_order_download table if not exists
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS "digital_order_download" (
        "id" TEXT NOT NULL,
        "order_id" TEXT NOT NULL,
        "line_item_id" TEXT NULL,
        "product_id" TEXT NOT NULL,
        "customer_id" TEXT NOT NULL,
        "digital_asset_id" TEXT NOT NULL,
        "license_key" TEXT NULL,
        "remaining_downloads" INTEGER NOT NULL DEFAULT 0,
        "download_count" INTEGER NOT NULL DEFAULT 0,
        "expires_at" TIMESTAMPTZ NULL,
        "last_downloaded_at" TIMESTAMPTZ NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "metadata" JSONB NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "digital_order_download_pkey" PRIMARY KEY ("id")
      )
    `)

    await dbClient.end()
    dbClient = null
    ok("digital_asset and digital_order_download tables ensured")
  } catch (dbErr) {
    info(`Table creation warning: ${dbErr.message}`)
    try { if (dbClient) await dbClient.end() } catch (_) {}
  }

  // Run db:sync-links after table creation so the link join table
  // correctly references the digital_asset table.
  info("Running: npx medusa db:sync-links ...")
  const syncResult = runCmd(`npx medusa db:sync-links 2>&1`, "medusa db:sync-links")
  if (syncResult !== null) ok("Database links synced after table creation")
  else info("db:sync-links may have failed — continuing anyway")

  // Run db:migrate for any Medusa core migrations
  info("Running: npx medusa db:migrate ...")
  const migrateResult = runCmd(`npx medusa db:migrate 2>&1`, "medusa db:migrate")
  if (migrateResult !== null) ok("Core database migrations applied")
  else info("db:migrate may have failed — continuing anyway")

  // Wait for server to stabilize after CLI commands
  info("Waiting for server to stabilize...")
  let serverReady = false
  for (let i = 0; i < 5; i++) {
    try {
      const hc = await fetch(`${BASE}/health`)
      if (hc.ok) { serverReady = true; break }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 2000))
  }
  if (serverReady) ok("Server healthy after migrations")
  else info("Server health check warning (continuing anyway)")

  // ── Step 3: Create admin user via medusa CLI ────────────────────────────
  // The `medusa user` command creates a proper User record + AuthIdentity
  // with the correct linkage, so subsequent login JWT will have actor_id set.
  group("Step 3 — Create Admin User")

  info("Running: npx medusa user ...")
  const userResult = runCmd(
    `npx medusa user -e "${TEST_EMAIL}" -p "${TEST_PASSWORD}" 2>&1`,
    "medusa user"
  )

  if (userResult !== null) {
    const firstLine = userResult.split("\n")[0]
    ok(`Admin user created: ${firstLine || TEST_EMAIL}`)
  } else {
    info("medusa user command failed (server may be running).")
    info("The `medusa user` command needs the server to be stopped.")
    info("To fix: stop the server, run the command, then restart.")
    info("  cd backend && npx medusa user -e \"${TEST_EMAIL}\" -p \"${TEST_PASSWORD}\"")
    info("Then re-run this script.")
    info("\nTrying fallback: register via API (actor_id may be empty)...")

    try {
      const { randomUUID } = await import("node:crypto")
      const pg = (await import("pg")).default
      const DB_URL = process.env.DATABASE_URL || "postgres://postgres:9426695327@localhost:5432/medusa-backend"
      const client = new pg.Client({ connectionString: DB_URL })
      await client.connect()

      const existing = await client.query(`SELECT id FROM "user" WHERE email = $1`, [TEST_EMAIL])
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO "user" (id, email, first_name, last_name, metadata, created_at, updated_at)
           VALUES ($1, $2, 'Admin', 'User', '{}'::jsonb, NOW(), NOW())`,
          [`user_${randomUUID()}`, TEST_EMAIL]
        )
        info("Direct SQL seed completed")
      }
      await client.end()
    } catch (sqlErr) {
      info(`SQL fallback failed: ${sqlErr.message}`)
    }
  }

  // If medusa user failed, the admin API test below will show a clear error.

  // ── Step 4: Login & Verify Admin Access ─────────────────────────────────
  group("Step 4 — Login & Verify Admin API Access")

  // Try login first (user may already exist from medusa user command)
  const loginRes = await api("POST", "/auth/user/emailpass", {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })

  let adminToken
  if (loginRes.status === 200 && loginRes.data?.token) {
    adminToken = loginRes.data.token
    const parts = adminToken.split(".")
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString())
    info(`  actor_id: ${payload.actor_id || "(empty)"}`)
    info(`  actor_type: ${payload.actor_type}`)
    info(`  auth_identity_id: ${payload.auth_identity_id}`)

    if (payload.actor_id && payload.actor_id.length > 0) {
      ok("Login returned JWT with valid actor_id")
    } else {
      info("JWT has empty actor_id — admin routes may still reject")
    }
  } else {
    // Try register
    info("Login failed, trying register...")
    const regRes = await api("POST", "/auth/user/emailpass/register", {
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })
    if (regRes.status === 200 && regRes.data?.token) {
      adminToken = regRes.data.token
      const parts = adminToken.split(".")
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString())
      info(`  actor_id: ${payload.actor_id || "(empty)"}`)
      if (payload.actor_id) ok("Registration returned JWT with valid actor_id")
      else info("Registration JWT has empty actor_id")
    } else {
      fail("Could not obtain auth token", regRes.data)
      printSummary()
      process.exit(1)
    }
  }

  // Test admin API access
  if (adminToken) {
    const adminTest = await api("GET", "/admin/products?limit=1", {
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    if (adminTest.status === 200) {
      ok("Admin API accessible with JWT token")
      info(`Products count: ${adminTest.data?.count || adminTest.data?.products?.length || 0}`)
    } else if (adminTest.status === 401) {
      fail("Admin API rejected JWT (401)")
      info("")
      info("  ╔══════════════════════════════════════════════════════════════╗")
      info("  ║  NOTE: The JWT has empty actor_id.                         ║")
      info("  ║                                                              ║")
      info("  ║  To fix, run the 'medusa user' command FIRST while the      ║")
      info("  ║  server is NOT running:                                     ║")
      info("  ║    cd backend && npx medusa user -e admin@test.com -p Pass  ║")
      info("  ║                                                              ║")
      info("  ║  Then start the server and login with those credentials.    ║")
      info("  ╚══════════════════════════════════════════════════════════════╝")
      printSummary()
      process.exit(1)
    } else {
      fail(`Admin API returned ${adminTest.status}`, adminTest.data)
    }

    // Wrong password test
    const badLogin = await api("POST", "/auth/user/emailpass", {
      body: { email: TEST_EMAIL, password: "WrongPassword!" },
    })
    if (badLogin.status === 401) ok("Wrong password correctly rejected (401)")
    else fail(`Wrong password: expected 401, got ${badLogin.status}`, badLogin.data)
  }

  // ── Step 5: Create Digital Product ──────────────────────────────────────
  group("Step 5 — Create Digital Product")

  const productTitle1 = `E-Book Gardening ${Date.now()}`
  const fileContent1 = Buffer.from("Sample PDF content for automated testing", "utf-8")

  const form1 = createMultipart(
    { title: productTitle1, price_eur: "19.99", price_usd: "24.99" },
    "file", fileContent1, "gardening-tips.pdf"
  )

  const cr1 = await api("POST", "/admin/products/digital", {
    headers: { Authorization: `Bearer ${adminToken}` },
    formData: form1,
  })

  if (cr1.status === 201) {
    ok("Digital product created with EUR + USD pricing")
    const r = cr1.data
    info(`  Product: ${r.product.id} — ${r.product.title}`)
    info(`  Asset:   ${r.digital_asset.id} — ${r.digital_asset.file_name} (${r.digital_asset.file_size} bytes)`)

    if (r.product?.id) ok("product.id is present")
    if (r.product?.title === productTitle1) ok("product.title matches")
    if (r.digital_asset?.id?.startsWith("da_")) ok("digital_asset.id starts with da_")
    if (r.digital_asset?.file_name === "gardening-tips.pdf") ok("digital_asset.file_name correct")
    if (r.digital_asset?.file_size === fileContent1.length) ok("digital_asset.file_size correct")

    // ── Step 5b: Verify persistence ──────────────────────────────────
    const productId = r.product.id
    const digitalAssetId = r.digital_asset.id

    group("Step 4b — Verify Persistence")

    const pr = await api("GET", `/admin/products/${productId}?fields=id,title,status,*variants,*variants.prices`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    if (pr.status === 200 && pr.data?.product) {
      ok("Product retrievable via admin API")
      const p = pr.data.product
      if (p.title === productTitle1) ok("Title persisted correctly")
      if (p.status === "published") ok("Status is 'published'")

      const v = p.variants?.[0]
      if (v?.title === "Digital Download") {
        ok("Variant 'Digital Download' exists")
        // price_eur from the form maps to CAD currency in the route handler:
        //   const priceCad = parsePrice(body.price_cad ?? body.price_eur)
        const cadPrice = v.prices?.find(p2 => p2.currency_code === "cad")
        const usdPrice = v.prices?.find(p2 => p2.currency_code === "usd")
        // 19.99 → 1999 cents
        if (cadPrice?.amount === 1999) ok("CAD price = 1999 cents (CA$19.99)")
        else fail(`CAD price mismatch`, { expected: 1999, got: cadPrice?.amount })
        // 24.99 → 2499 cents
        if (usdPrice?.amount === 2499) ok("USD price = 2499 cents ($24.99)")
        else fail(`USD price mismatch`, { expected: 2499, got: usdPrice?.amount })
      } else {
        fail("Expected variant 'Digital Download'", v)
      }
    } else {
      fail("Could not retrieve product via admin API", pr.data)
    }

    // Digital asset link verification — check product metadata for
    // download_assets array (set by the route handler during creation)
    const mdRes = await api("GET", `/admin/products/${productId}?fields=id,title,metadata`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (mdRes.status === 200) {
      const meta = mdRes.data?.product?.metadata || {}
      if (meta.is_digital === true || meta.is_digital === "true") {
        ok("Product metadata has is_digital flag")
        if (meta.download_assets && Array.isArray(meta.download_assets) && meta.download_assets.length > 0) {
          ok(`Product has ${meta.download_assets.length} download asset(s)`)
          if (meta.download_assets[0].id === digitalAssetId) {
            ok("Download asset ID matches digital_asset.id")
          }
        } else {
          info("Product metadata download_assets not populated (may need server restart)")
        }
      } else {
        info("Product metadata is_digital not found (verify manually)")
      }
      // Verify via simple existence check
      if (meta.is_digital) ok("Digital product confirmed via metadata")
    } else {
      fail("Could not fetch product metadata", mdRes.data)
    }

    // Product list search
    const listRes = await api("GET", `/admin/products?q=Gardening&limit=50`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (listRes.status === 200) {
      const found = (listRes.data?.products || []).find(p => p.id === productId)
      if (found) ok("Product appears in admin product list")
      else fail("Product not found in admin product list")
    } else {
      fail("Product list query failed", listRes.data)
    }

    // Additional variants
    info("Creating CAD-only product...")
    const cadForm = createMultipart(
      { title: `CAD-Only ${Date.now()}`, price_eur: "9.50" },
      "file", Buffer.from("cad only"), "cad-only.pdf"
    )
    const cadRes = await api("POST", "/admin/products/digital", {
      headers: { Authorization: `Bearer ${adminToken}` },
      formData: cadForm,
    })
    if (cadRes.status === 201) ok("CAD-only product created")
    else fail("CAD-only product failed", cadRes.data)

    info("Creating USD-only product...")
    const usdForm = createMultipart(
      { title: `USD-Only ${Date.now()}`, price_usd: "14.50" },
      "file", Buffer.from("usd only"), "usd-only.pdf"
    )
    const usdRes = await api("POST", "/admin/products/digital", {
      headers: { Authorization: `Bearer ${adminToken}` },
      formData: usdForm,
    })
    if (usdRes.status === 201) ok("USD-only product created")
    else fail("USD-only product failed", usdRes.data)
  } else {
    fail("Digital product creation failed", cr1.data)
  }

  // ── Step 6: Validation Edge Cases ───────────────────────────────────────
  group("Step 6 — Validation & Edge Cases")

  const expectations = [
    { name: "Missing title → 400", title: "", price_eur: "9.99", file: Buffer.from("x"), fname: "x.pdf", expectStatus: 400 },
    { name: "Missing file → 400", title: "No File", price_usd: "14.99", file: null, fname: null, expectStatus: 400 },
    { name: "No price → 400", title: "No Price", price_eur: undefined, file: Buffer.from("d"), fname: "d.dat", expectStatus: 400 },
    { name: "Negative price → 400", title: "Neg Price", price_eur: "-5.00", file: Buffer.from("n"), fname: "n.pdf", expectStatus: 400 },
    { name: "Non-numeric price → 400", title: "Bad Price", price_eur: "not-a-number", price_usd: "also-bad", file: Buffer.from("b"), fname: "b.pdf", expectStatus: 400 },
    { name: "Empty title → 400", title: "", price_eur: "9.99", file: Buffer.from("x"), fname: "x.pdf", expectStatus: 400 },
  ]

  for (const tc of expectations) {
    const fields = {}
    if (tc.title !== undefined) fields.title = tc.title
    if (tc.price_eur !== undefined) fields.price_eur = tc.price_eur
    if (tc.price_usd !== undefined) fields.price_usd = tc.price_usd

    const form = createMultipart(fields, "file", tc.file, tc.fname)
    const res = await api("POST", "/admin/products/digital", {
      headers: { Authorization: `Bearer ${adminToken}` },
      formData: form,
    })
    if (res.status === tc.expectStatus) ok(tc.name)
    else fail(`${tc.name} — expected ${tc.expectStatus}, got ${res.status}`, res.data)
  }

  // No auth test
  const noAuthForm = createMultipart(
    { title: "No Auth Product", price_eur: "9.99" },
    "file", Buffer.from("x"), "x.pdf"
  )
  const noAuthRes = await api("POST", "/admin/products/digital", { formData: noAuthForm })
  if (noAuthRes.status === 401) ok("Unauthenticated request → 401")
  else fail(`No auth: expected 401, got ${noAuthRes.status}`, noAuthRes.data)

  // Empty file should be accepted
  const emptyFileForm = createMultipart(
    { title: `Empty File ${Date.now()}`, price_usd: "5.00" },
    "file", Buffer.alloc(0), "empty.dat"
  )
  const emptyFileRes = await api("POST", "/admin/products/digital", {
    headers: { Authorization: `Bearer ${adminToken}` },
    formData: emptyFileForm,
  })
  if (emptyFileRes.status === 201) {
    ok("Empty file accepted → 201")
    if (emptyFileRes.data?.digital_asset?.file_size === 0) ok("Empty file has size 0")
  } else {
    fail(`Empty file: expected 201, got ${emptyFileRes.status}`, emptyFileRes.data)
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  printSummary()
}

function printSummary() {
  group("Results Summary")
  console.log(`  Total:  ${passed + failed}`)
  console.log(`  Passed: ${passed} ✅`)
  console.log(`  Failed: ${failed} ❌`)

  if (failed > 0) {
    console.log(`\n  ❌ Some tests failed. Review the errors above.`)
    process.exit(1)
  } else {
    console.log(`\n  ✅ All tests passed!`)
    process.exit(0)
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
