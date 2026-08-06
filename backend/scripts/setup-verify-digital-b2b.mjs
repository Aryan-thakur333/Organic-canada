#!/usr/bin/env node
/**
 * Setup helper for verify-authenticated-digital-b2b.mjs
 *
 * 1. Registers two fresh customers (A = digital download owner, B = B2B).
 * 2. Creates a digital_order_download entitlement for A linked to an existing
 *    paid digital order + a real file on disk (so blob download returns 200).
 * 3. Creates an approved B2B company for B.
 * 4. Prints CUSTOMER_TOKEN and B2B_TOKEN env values for the verification run.
 *
 * Usage:
 *   node backend/scripts/setup-verify-digital-b2b.mjs
 */

import axios from "axios";

const BASE = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";
const PK = "pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491";
const PASSWORD = "TestPass123!";
// Read from the backend .env (DATABASE_URL). No credentials are embedded here.
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.MEDUSA_DATABASE_URL ||
  "";
if (!DATABASE_URL) {
  throw new Error(
    "[setup-verify-digital-b2b] Missing DATABASE_URL. Set it (e.g. from backend/.env) before running."
  );
}
const TS = Date.now();
const emailA = `verify-digital-${TS}@eatsie.test`;
const emailB = `verify-b2b-${TS}@eatsie.test`;

// Existing paid digital order + real file on disk (from earlier test runs).
const SOURCE_ORDER_ID = "order_01KWRHGX4AKZFH1F2HBVRY830J";
const SOURCE_PRODUCT_ID = "prod_01KWRHGVF51RH6HYB0H5DJ69PJ";
const SOURCE_VARIANT_ID = "variant_01KWRHGVF51RH6HYB0H5DJ69PJ";
const STORAGE_KEY = "uploads/digital/asset_692be533b69bdc373ef6a3bcb1187f9c-currency-test.pdf";
const FILE_NAME = "currency-test.pdf";
const SOURCE_ASSET_ID = "da_01KWRHGVNB4KBPEKV3FH6RNFH3";

const http = axios.create({
  baseURL: BASE,
  timeout: 30_000,
  validateStatus: () => true,
});

function storeHeaders(token) {
  return { "x-publishable-api-key": PK, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function registerCustomer(email) {
  const reg = await http.post("/auth/customer/emailpass/register", {
    email,
    password: PASSWORD,
  }, { headers: storeHeaders() });
  if (reg.status !== 200) throw new Error(`register ${email} failed: ${reg.status} ${JSON.stringify(reg.data)}`);

  const token = reg.data.token;
  const profile = await http.post("/store/customers", {
    email,
    first_name: "Verify",
    last_name: "Digital",
  }, { headers: storeHeaders(token) });
  if (profile.status !== 200 && profile.status !== 201) {
    throw new Error(`profile ${email} failed: ${profile.status} ${JSON.stringify(profile.data)}`);
  }

  const login = await http.post("/auth/customer/emailpass", {
    email,
    password: PASSWORD,
  }, { headers: storeHeaders() });
  if (login.status !== 200 || !login.data.token) {
    throw new Error(`login ${email} failed: ${login.status} ${JSON.stringify(login.data)}`);
  }

  const me = await http.get("/store/customers/me", { headers: storeHeaders(login.data.token) });
  const customerId = me.data?.customer?.id || me.data?.id;
  if (!customerId) throw new Error(`no customer id for ${email}`);

  return { email, token: login.data.token, customerId };
}

async function createEntitlement(customerId, customerToken) {
  const res = await http.get("/store/customers/me/downloads", { headers: storeHeaders(customerToken) });
  if (res.status !== 200) throw new Error(`downloads list failed: ${res.status} ${JSON.stringify(res.data)}`);
  const existing = Array.isArray(res.data?.downloads) ? res.data.downloads : [];
  const hasTarget = existing.find((d) => d.product_id === SOURCE_PRODUCT_ID);
  if (hasTarget) {
    console.log("[setup] entitlement already exists for this product, reusing:", hasTarget.id);
    return hasTarget.id;
  }

  // Local-only helper: creates the entitlement row directly in the DB because
  // there is no public store route that fabricates entitlements. The hardcoded
  // IDs below reference test data from this environment only.
  const { Client } = await import("pg");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const id = `dld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const metadata = {
    title: "currency-test.pdf",
    is_digital: true,
    version: "1.0.0",
    file_name: FILE_NAME,
    mime_type: "application/pdf",
    file_size: 1024,
    storage_key: STORAGE_KEY,
    download_limit: 5,
    download_expiry_days: 365,
    order_id: SOURCE_ORDER_ID,
    customer_id: customerId,
    line_item_id: "ordli_000000000000000000000000",
    product_id: SOURCE_PRODUCT_ID,
    variant_id: SOURCE_VARIANT_ID,
    asset_id: SOURCE_ASSET_ID,
    filename: FILE_NAME,
    status: "active",
    is_paid: true,
    remaining_downloads: 5,
  };
  await client.query(
    `INSERT INTO digital_order_download
       (id, order_id, line_item_id, product_id, customer_id, digital_asset_id,
        remaining_downloads, download_count, expires_at, is_active, license_key,
        metadata, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
    [
      id, SOURCE_ORDER_ID, "ordli_000000000000000000000000", SOURCE_PRODUCT_ID, customerId,
      SOURCE_ASSET_ID, 5, 0, expiresAt, true, null,
      JSON.stringify(metadata),
    ]
  );
  await client.end();
  console.log("[setup] created entitlement:", id);
  return id;
}

async function createB2BCompany(customerId, customerToken) {
  const res = await http.post("/store/b2b/company", {
    company_name: `Verify B2B Company ${TS}`,
    tax_id: `TAX-${TS}`,
    requested_credit_limit: 100000,
  }, { headers: storeHeaders(customerToken) });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`b2b company create failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  const companyId = res.data?.company?.id || res.data?.id;
  if (!companyId) throw new Error("no company id returned");

  // Approve directly in DB (admin approval API requires admin session).
  const { Client } = await import("pg");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(
    `UPDATE company SET status='approved', approved_at=NOW(), approved_by='setup-script',
       approved_credit_limit=100000, admin_note='Auto-approved by verify setup'
     WHERE id=$1`,
    [companyId]
  );
  await client.end();
  console.log("[setup] approved B2B company:", companyId);
  return companyId;
}

async function main() {
  console.log(`[setup] emailA=${emailA}`);
  console.log(`[setup] emailB=${emailB}`);

  const customerA = await registerCustomer(emailA);
  console.log("[setup] customer A:", customerA.customerId);

  const entitlementId = await createEntitlement(customerA.customerId, customerA.token);
  console.log("[setup] entitlement:", entitlementId);

  const customerB = await registerCustomer(emailB);
  console.log("[setup] customer B:", customerB.customerId);
  const companyId = await createB2BCompany(customerB.customerId, customerB.token);
  console.log("[setup] company:", companyId);

  console.log("\n=== ENV VALUES FOR VERIFICATION ===");
  console.log(`CUSTOMER_TOKEN=${customerA.token}`);
  console.log(`B2B_TOKEN=${customerB.token}`);
  console.log("\nRun with:");
  console.log("  CUSTOMER_TOKEN=<token> B2B_TOKEN=<token> node backend/scripts/verify-authenticated-digital-b2b.mjs");
}

main().catch((err) => {
  console.error("[setup] FAILED:", err?.message || err);
  process.exit(1);
});
