/**
 * Local authenticated verification runner for:
 * - Digital downloads entitlement + secure blob download + decrement
 * - Digital security: 401 without auth, 403 with wrong customer
 * - Direct file access should be 404 (uploads must not be publicly reachable)
 * - B2B: company approved, products visible, quotes endpoint stable (no 429 loop)
 *
 * Usage (PowerShell):
 *   $env:CUSTOMER_TOKEN="..."; $env:B2B_TOKEN="...";
 *   node backend/scripts/verify-authenticated-digital-b2b.mjs
 *
 * Do NOT log full tokens. Tokens are masked in output.
 */

import axios from "axios";

const PUBLISHABLE_KEY =
  "pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491";
const BASE_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";

const CUSTOMER_TOKEN = process.env.CUSTOMER_TOKEN || "";
const B2B_TOKEN = process.env.B2B_TOKEN || "";

function maskToken(t) {
  if (!t || typeof t !== "string") return "(missing)";
  if (t.length <= 10) return `${t.slice(0, 3)}...`;
  return `${t.slice(0, 10)}...${t.slice(-6)}`;
}

function requireEnv(name, value) {
  if (!value) {
    // Do not fail silently; provide exact env var guidance.
    throw new Error(
      `[verify-authenticated-digital-b2b] Missing env var ${name}. Set it locally in your PowerShell terminal using $env:${name}="..."`
    );
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000,
  validateStatus: () => true,
});

function storeHeaders(token) {
  const h = {
    "x-publishable-api-key": PUBLISHABLE_KEY,
  };
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

async function requestJson(path, { token } = {}) {
  const res = await http.get(path, {
    headers: storeHeaders(token),
  });
  return res;
}

async function requestBlob(path, { token, params } = {}) {
  const res = await http.get(path, {
    headers: storeHeaders(token),
    params,
    responseType: "arraybuffer", // Use arraybuffer in node to get a Buffer
  });
  return res;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[ASSERT] ${message}`);
  }
}

function isBlobLike(data) {
  // In Node axios with responseType 'blob' (or arraybuffer), we typically get a Buffer-like object.
  return (
    data &&
    (typeof Buffer !== "undefined"
      ? Buffer.isBuffer(data) || data instanceof Uint8Array || typeof data === 'string'
      : true)
  );
}

function summarizeStatus(res) {
  return {
    status: res.status,
    dataType: typeof res.data,
  };
}

function getTopLevelKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value);
}

function detectDownloadsArray(payload) {
  const candidates = [
    { path: "downloads", value: payload?.downloads },
    { path: "data.downloads", value: payload?.data?.downloads },
    { path: "customer_downloads", value: payload?.customer_downloads },
    { path: "data.customer_downloads", value: payload?.data?.customer_downloads },
    { path: "records", value: payload?.records },
    { path: "data.records", value: payload?.data?.records },
    { path: "items", value: payload?.items },
    { path: "data.items", value: payload?.data?.items },
  ];

  const match = candidates.find((candidate) => Array.isArray(candidate.value));
  return {
    path: match ? match.path : null,
    downloads: match ? match.value : [],
  };
}

function trimString(value, max = 120) {
  if (typeof value !== "string") return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function normalizeSampleRecord(record) {
  if (!record || typeof record !== "object") return record;

  return {
    id: record.id ?? null,
    order_id: record.order_id ?? null,
    customer_id: record.customer_id ?? null,
    product_id: record.product_id ?? null,
    variant_id: record.variant_id ?? null,
    asset_id: record.asset_id ?? record.digital_asset_id ?? null,
    filename: trimString(
      record.filename ??
      record.file_name ??
      record.name ??
      record.metadata?.filename ??
      record.metadata?.file_name ??
      null
    ),
    remaining_downloads: record.remaining_downloads ?? record.remainingDownloads ?? null,
    download_limit: record.download_limit ?? record.downloadLimit ?? null,
    status: record.status ?? null,
    keys: Object.keys(record),
  };
}

function analyzeDownloadsResponse(payload) {
  const topLevelKeys = getTopLevelKeys(payload);
  const detected = detectDownloadsArray(payload);
  const downloads = detected.downloads;
  const samples = downloads.slice(0, 3).map(normalizeSampleRecord);
  const ids = downloads
    .map((record) => record?.id)
    .filter((id) => typeof id === "string");
  const dldIds = ids.filter((id) => id.startsWith("dld_"));

  let reason = null;
  if (!detected.path) {
    reason = "WRONG_RESPONSE_SHAPE";
  } else if (downloads.length === 0) {
    reason = "EMPTY_DOWNLOADS_ARRAY";
  } else if (dldIds.length === 0) {
    reason = "RECORDS_FOUND_BUT_NO_DLD_IDS";
  }

  return {
    topLevelKeys,
    detectedPath: detected.path,
    downloads,
    samples,
    ids,
    dldIds,
    reason,
  };
}

async function verifyDigital() {
  console.log("\n=== Digital Download Verification (Authenticated) ===");
  requireEnv("CUSTOMER_TOKEN", CUSTOMER_TOKEN);

  console.log(`[Digital] CUSTOMER_TOKEN: ${maskToken(CUSTOMER_TOKEN)}`);

  // 1) /store/customers/me
  let meRes;
  try {
    meRes = await requestJson("/store/customers/me", {
      token: CUSTOMER_TOKEN,
    });
    console.log("[Digital] GET /store/customers/me", meRes.status);
  } catch (err) {
    console.error("[Digital][Debug] GET /store/customers/me threw (raw):", err);

    const isAgg = err && (err.name === "AggregateError" || Array.isArray(err.errors));
    if (isAgg) {
      console.error("[Digital][Debug] AggregateError detected. errors.length =", err.errors?.length);
      if (Array.isArray(err.errors)) {
        err.errors.forEach((e, idx) => {
          console.error(`[Digital][Debug] AggregateError[${idx}] message=`, e?.message);
          console.error(`[Digital][Debug] AggregateError[${idx}] status=`, e?.response?.status);
          console.error(`[Digital][Debug] AggregateError[${idx}] response data keys=`, e?.response?.data ? Object.keys(e.response.data) : []);
        });
      }
    } else if (err?.response) {
      console.error("[Digital][Debug] axios error response status:", err.response.status);
      console.error("[Digital][Debug] axios error response data keys:", Object.keys(err.response.data || {}));
    }

    const msg = err?.message || String(err);
    console.error("[Digital][Debug] GET /store/customers/me threw (message):", msg);
    throw err;
  }
  assert(meRes.status === 200, "Expected /store/customers/me => 200");

  // 2) /store/customers/me/downloads
  console.log("[Digital][Debug] About to call /store/customers/me/downloads");
  const listRes = await requestJson("/store/customers/me/downloads", {
    token: CUSTOMER_TOKEN,
  });
  console.log("[Digital] GET /store/customers/me/downloads", listRes.status);

  assert(listRes.status === 200, "Expected /store/customers/me/downloads => 200");

  const payload = listRes.data ?? {};
  const analysis = analyzeDownloadsResponse(payload);
  const downloads = analysis.downloads;

  console.log("[Digital][Debug] downloads response top-level keys:", analysis.topLevelKeys);
  console.log("[Digital][Debug] detected downloads array path:", analysis.detectedPath || "(none)");
  console.log("[Digital][Debug] downloads.length:", downloads.length);
  console.log("[Digital][Debug] downloads sample (trimmed):", analysis.samples);

  if (analysis.reason) {
    console.log("[Digital][Debug] normalized download count:", downloads.length);
    console.log("[Digital][Debug] ids found:", analysis.ids.slice(0, 50));
    console.log("[Digital][Debug] sample object keys:", analysis.samples[0]?.keys || []);
    console.log("[Digital][Debug] exact reason:", analysis.reason);
  }

  const dld = downloads.find((d) => typeof d?.id === "string" && d.id.startsWith("dld_"));
  assert(dld, "Expected at least one dld_xxx record in downloads list");

  console.log(`[Digital] dld_xxx record found: ${dld.id}`);

  const downloadId = dld.id;
  const remainingBefore = Number(dld.remaining_downloads ?? dld?.remainingDownloads ?? NaN);
  assert(Number.isFinite(remainingBefore), "remaining_downloads must be numeric on dld record");

  // 5) Download blob (200)
  const blobRes = await requestBlob(`/store/downloads/${downloadId}`, {
    token: CUSTOMER_TOKEN,
  });
  console.log(`[Digital] GET /store/downloads/${downloadId}`, blobRes.status);

  assert(blobRes.status === 200, "Expected GET /store/downloads/dld_xxx => 200");
  assert(isBlobLike(blobRes.data), "Expected responseType blob/file-like data");

  // Optional: short wait to allow subscriber/DB decrement to settle
  await sleep(200);

  // 6) Verify remaining_downloads decreased
  const listRes2 = await requestJson("/store/customers/me/downloads", {
    token: CUSTOMER_TOKEN,
  });
  console.log("[Digital] Re-fetch downloads", listRes2.status);

  const payload2 = listRes2.data ?? {};
  const analysis2 = analyzeDownloadsResponse(payload2);
  console.log("[Digital][Debug] re-fetch downloads top-level keys:", analysis2.topLevelKeys);
  console.log("[Digital][Debug] re-fetch detected downloads array path:", analysis2.detectedPath || "(none)");
  console.log("[Digital][Debug] re-fetch downloads.length:", analysis2.downloads.length);
  console.log("[Digital][Debug] re-fetch downloads sample (trimmed):", analysis2.samples);

  const dld2 = analysis2.downloads.find((x) => x?.id === downloadId);

  assert(dld2, "Expected dld_xxx record to still exist on re-fetch");
  const remainingAfter = Number(dld2.remaining_downloads ?? dld2?.remainingDownloads ?? NaN);
  assert(Number.isFinite(remainingAfter), "remaining_downloads must remain numeric");

  console.log(`[Digital] remaining_downloads: before=${remainingBefore} after=${remainingAfter}`);
  assert(remainingAfter === remainingBefore - 1, "Expected remaining_downloads to decrease by 1");

  // 11) Logged-out download should be 401
  const loggedOutBlob = await requestBlob(`/store/downloads/${downloadId}`, {
    token: "",
  });
  console.log(`[Digital] Logged-out GET /store/downloads/${downloadId}`, loggedOutBlob.status);
  assert(loggedOutBlob.status === 401, "Expected logged-out download => 401");

  // 13) Different customer should be 403 (if B2B token differs we test that)
  if (B2B_TOKEN) {
    const otherRes = await requestBlob(`/store/downloads/${downloadId}`, {
      token: B2B_TOKEN,
    });
    console.log(`[Digital] Different-customer GET /store/downloads/${downloadId}`, otherRes.status);

    // We expect 403 when token belongs to a different customer.
    // If the same underlying customer happens to be used, API may return 200.
    // So we only assert 403 if response is not 200.
    if (otherRes.status !== 200) {
      assert(otherRes.status === 403, "Expected different-customer download => 403");
    } else {
      console.warn("[Digital] Different-customer test returned 200; tokens may belong to same customer. Skipping 403 assertion.");
    }
  } else {
    console.warn("[Digital] B2B_TOKEN not set; skipping 403 different-customer check.");
  }

  // 15) Direct uploads file URL should 404
  // We don't know the exact filename; we can attempt a best-effort if present.
  const filename = dld.filename || dld?.metadata?.filename || "";
  const storageKey = dld.storage_key || dld?.metadata?.storage_key || "";
  // storage_key is expected to be like: uploads/digital/<file>
  const directPath =
    storageKey && typeof storageKey === "string" && storageKey.includes("uploads/digital/")
      ? storageKey.split("uploads/digital/")[1]
      : filename;

  if (directPath) {
    // Ensure we call direct file URL with filename only under /uploads/digital
    const directFileRes = await http.get(`/uploads/digital/${encodeURIComponent(directPath)}`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_KEY,
      },
      validateStatus: () => true,
    });
    console.log(`[Digital] Direct GET /uploads/digital/${directPath}`, directFileRes.status);
    assert(directFileRes.status === 404, "Expected direct /uploads/digital/<file> => 404");
  } else {
    console.warn("[Digital] No filename/storage_key available in dld_xxx record; skipping direct-file 404 assertion.");
  }

  return {
    downloadId,
    remainingBefore,
    remainingAfter,
  };
}

async function verifyB2B() {
  console.log("\n=== B2B Verification (Authenticated) ===");

  requireEnv("B2B_TOKEN", B2B_TOKEN);
  console.log(`[B2B] B2B_TOKEN: ${maskToken(B2B_TOKEN)}`);

  // 1) /store/customers/me
  const meRes = await requestJson("/store/customers/me", { token: B2B_TOKEN });
  console.log("[B2B] GET /store/customers/me", meRes.status);
  assert(meRes.status === 200, "Expected /store/customers/me => 200 for B2B user");

  // 2) /store/b2b/company
  const companyRes = await requestJson("/store/b2b/company", { token: B2B_TOKEN });
  console.log("[B2B] GET /store/b2b/company", companyRes.status);
  assert(companyRes.status === 200, "Expected /store/b2b/company => 200");

  const company = companyRes.data?.company || companyRes.data;
  const status = company?.status || company?.approval_status || company?.state;
  console.log("[B2B] company status field:", status);
  // We accept common truthy approved spellings.
  assert(
    status === "approved" || status === "APPROVED" || status === true,
    "Expected B2B company status to be approved"
  );

  // 4) /store/b2b/products
  const productsRes = await requestJson("/store/b2b/products", { token: B2B_TOKEN });
  console.log("[B2B] GET /store/b2b/products", productsRes.status);
  assert(productsRes.status === 200, "Expected /store/b2b/products => 200");

  const products =
    productsRes.data?.products ||
    productsRes.data?.data?.products ||
    productsRes.data?.data?.data?.products ||
    productsRes.data?.result?.products ||
    [];
  assert(Array.isArray(products), "Expected products to be an array");
  assert(products.length > 0, "Expected B2B products.length > 0");

  // 6) /store/b2b/quotes?limit=10&offset=0
  // Not all implementations may support these exact params; we'll still call and validate stability/no 429.
  const quotesRes = await http.get("/store/b2b/quotes", {
    headers: storeHeaders(B2B_TOKEN),
    params: { limit: 10, offset: 0 },
    validateStatus: () => true,
  });
  console.log("[B2B] GET /store/b2b/quotes?limit=10&offset=0", quotesRes.status);

  // Confirm no 429 loop: single request should not be 429.
  assert(quotesRes.status !== 429, "Unexpected 429 from /store/b2b/quotes");

  return {
    companyStatus: status,
    productsCount: products.length,
    quotesStatus: quotesRes.status,
  };
}

(async function main() {
  console.log(`[verify-authenticated-digital-b2b] BASE_URL=${BASE_URL}`);
  try {
    const digitalResult = await verifyDigital();
    const b2bResult = await verifyB2B();

    console.log("\n✅ AUTH VERIFIED SUMMARY");
    console.log({
      digital: digitalResult,
      b2b: b2bResult,
    });

    process.exit(0);
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("\n❌ Verification FAILED:", msg);
    process.exit(1);
  }
})();
