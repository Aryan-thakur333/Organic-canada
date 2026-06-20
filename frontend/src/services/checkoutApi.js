/**
 * @typedef {{ id: string; title?: string; price: number; quantity: number; image?: string | null }} CheckoutLineItem
 * @typedef {{ name: string; phone: string; address: string }} CheckoutCustomer
 * @typedef {{
 *   id: string;
 *   fulfillment: string;
 *   paymentMethod: string;
 *   status: string;
 *   paymentIntentId: string | null;
 *   subtotal: number;
 *   tax: number;
 *   discount: number;
 *   total: number;
 *   totalCents: number;
 *   customer: CheckoutCustomer;
 *   items: CheckoutLineItem[];
 *   createdAt: string;
 *   cancelledAt?: string | null;
 * }} SavedOrder
 */

const ROOT = (import.meta.env.VITE_CHECKOUT_API_BASE || "").replace(/\/$/, "") || "/api/v1";

/**
 * @param {string} subPath e.g. `/payment-intents` or `/orders`
 */
function apiUrl(subPath) {
  const path = subPath.startsWith("/") ? subPath : `/${subPath}`;
  if (ROOT.startsWith("http")) return `${ROOT}${path}`;
  return `${ROOT}${path}`;
}

/**
 * @param {Response} res
 */
async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, unknown>} data
 */
function extractErrorMessage(data) {
  if (data?.error && typeof data.error === "object" && data.error.message) {
    return String(data.error.message);
  }
  if (typeof data?.error === "string") return data.error;
  if (data?.message) return String(data.message);
  return "Request failed";
}

/**
 * @param {string} subPath
 * @param {RequestInit} [init]
 */
async function checkoutFetch(subPath, init) {
  const res = await fetch(apiUrl(subPath), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const err = new Error(extractErrorMessage(data));
    err.status = res.status;
    err.code = data?.error && typeof data.error === "object" ? data.error.code : undefined;
    err.details = data?.error;
    err.requestId = data?.requestId;
    throw err;
  }
  return data;
}

/**
 * @param {number} amountCents
 * @param {string} [currency]
 * @returns {Promise<{ clientSecret: string; paymentIntentId: string }>}
 */
export async function createCheckoutPaymentIntent(amountCents, currency = "usd") {
  const data = await checkoutFetch("/payment-intents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountCents, currency }),
  });
  if (!data.clientSecret) {
    throw new Error("Invalid response from payment server");
  }
  return {
    clientSecret: data.clientSecret,
    paymentIntentId: data.paymentIntentId || "",
  };
}

/**
 * @param {{
 *   fulfillment: "stripe" | "cod";
 *   paymentMethod: string;
 *   paymentIntentId?: string | null;
 *   customer: CheckoutCustomer;
 *   items: CheckoutLineItem[];
 *   discount?: number;
 * }} body
 * @returns {Promise<{ order: SavedOrder }>}
 */
export async function finalizeCheckoutOrder(body) {
  const data = await checkoutFetch("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!data?.order) {
    throw new Error("Checkout server did not return an order. Is payment-server running?");
  }
  return data;
}

/**
 * @param {{ phone?: string; adminKey?: string }} [opts]
 * @returns {Promise<{ orders: SavedOrder[] }>}
 */
export async function listCheckoutOrders(opts = {}) {
  const params = new URLSearchParams();
  if (opts.phone) params.set("phone", opts.phone);
  const q = params.toString();
  const headers = {};
  if (opts.adminKey) headers["x-admin-key"] = opts.adminKey;
  return checkoutFetch(`/orders${q ? `?${q}` : ""}`, { headers });
}

/**
 * @param {string} orderId
 * @param {{ phone?: string; adminKey?: string }} [opts]
 */
export async function getCheckoutOrder(orderId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.phone) params.set("phone", opts.phone);
  const q = params.toString();
  const headers = {};
  if (opts.adminKey) headers["x-admin-key"] = opts.adminKey;
  return checkoutFetch(`/orders/${encodeURIComponent(orderId)}${q ? `?${q}` : ""}`, {
    headers,
  });
}

/**
 * @param {string} orderId
 */
export async function cancelCheckoutOrder(orderId) {
  return checkoutFetch(`/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
  });
}
