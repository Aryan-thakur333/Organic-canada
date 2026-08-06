import apiClient, { clearPosStaffAuth, setPosStaffAuth } from "./apiClient";

export const POS_STAFF_KEY = "eatsie_pos_staff";
export const POS_REGISTER_KEY = "eatsie_pos_register";

function readJson(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; }
}

export const getPosStaff = () => readJson(POS_STAFF_KEY);
export const getPosRegister = () => readJson(POS_REGISTER_KEY);
export const setPosStaff = (staff) => sessionStorage.setItem(POS_STAFF_KEY, JSON.stringify(staff));
export const setStoredPosRegister = (register) => sessionStorage.setItem(POS_REGISTER_KEY, JSON.stringify(register));
export const clearStoredPosRegister = () => sessionStorage.removeItem(POS_REGISTER_KEY);

export function clearStoredPosRuntime() {
  sessionStorage.removeItem(POS_STAFF_KEY);
  sessionStorage.removeItem(POS_REGISTER_KEY);
  sessionStorage.removeItem("eatsie_pos_session");
  sessionStorage.removeItem("eatsie_pos_registers");
  sessionStorage.removeItem("eatsie_pos_register_list");
  sessionStorage.removeItem("eatsie_pos_selected_register");
  sessionStorage.removeItem("eatsie_pos_request_state");
  sessionStorage.removeItem("eatsie_pos_cart");
}

export function clearPosStaff() {
  clearStoredPosRuntime();
  clearPosStaffAuth();
}

export async function loginPosStaff({ email, password }) {
  clearStoredPosRuntime();
  clearPosStaffAuth();
  const auth = await apiClient.post("/auth/user/emailpass", { email: email.trim().toLowerCase(), password });
  if (!auth?.token) throw new Error("POS authentication did not return a token");
  const actorId = setPosStaffAuth(auth.token);
  return { authenticated: true, actorId };
}

export function normalizeRegisterResponse(payload) {
  const registers = Array.isArray(payload?.registers)
    ? payload.registers
    : Array.isArray(payload?.data?.registers)
      ? payload.data.registers
      : [];
  const normalized = registers.filter(Boolean);
  Object.defineProperties(normalized, {
    __rawRegisterCount: {
      value: Array.isArray(payload?.registers)
      ? payload.registers.length
      : Array.isArray(payload?.data?.registers)
        ? payload.data.registers.length
        : 0,
      enumerable: false,
    },
    __normalizedRegisterCount: {
      value: normalized.length,
      enumerable: false,
    },
    __diagnostics: {
      value: payload?.diagnostics || payload?.data?.diagnostics || null,
      enumerable: false,
    },
  });
  return normalized;
}

export function assertFlatRegisterResponse(payload) {
  const registers = normalizeRegisterResponse(payload);
  if (!Array.isArray(registers)) {
    throw new Error("POS_REGISTER_RESPONSE_INVALID");
  }
  for (const register of registers) {
    if (!register?.id || !register?.name || !register?.code || !register?.status || !register?.currency_code) {
      throw new Error("POS_REGISTER_RESPONSE_INVALID");
    }
    if (register.register || register.assignment || register.data || register.items || register.rows) {
      throw new Error("POS_REGISTER_RESPONSE_INVALID");
    }
  }
  return registers;
}

export function normalizeCurrentSession(payload) {
  const rawSession = payload?.session;
  if (rawSession == null) return null;
  if (!rawSession || !rawSession.id || !rawSession.register_id || !rawSession.operator_id || String(rawSession.status || "").toUpperCase() !== "OPEN") {
    throw new Error("POS_SESSION_RESPONSE_INVALID");
  }
  const register = rawSession.register || payload?.register || null;
  return { ...rawSession, register };
}

export function normalizeBootstrapResponse(payload) {
  if (!payload?.authenticated || !payload?.operator?.id) {
    throw new Error("POS_BOOTSTRAP_RESPONSE_INVALID");
  }
  const registers = assertFlatRegisterResponse(payload);
  if (!["ready", "empty"].includes(payload.assignment_state)) {
    throw new Error("POS_BOOTSTRAP_ASSIGNMENT_STATE_INVALID");
  }
  if ((payload.assignment_state === "empty") !== (registers.length === 0)) {
    throw new Error("POS_BOOTSTRAP_ASSIGNMENT_STATE_INVALID");
  }
  const session = normalizeCurrentSession({ session: payload.session });
  if (session?.register && !registers.some((register) => register.id === session.register_id)) {
    throw new Error("POS_BOOTSTRAP_SESSION_REGISTER_INVALID");
  }
  return { authenticated: true, operator: payload.operator, registers, session, assignment_state: payload.assignment_state, meta: payload.meta || null };
}

export async function bootstrapPos(config = {}) {
  return normalizeBootstrapResponse(await apiClient.get("/pos/bootstrap", config));
}

export async function getCurrentSession(config = {}) {
  return normalizeCurrentSession(await apiClient.get("/pos/me/session", config));
}

export async function getMyRegisters(config = {}) {
  const payload = await apiClient.get("/pos/me/registers", config);
  return assertFlatRegisterResponse(payload);
}

export const posApi = {
  logout: () => apiClient.delete("/pos/auth/session"),
  me: (config = {}) => apiClient.get("/pos/me", config),
  bootstrap: bootstrapPos,
  getCurrentSession,
  currentSession: getCurrentSession,
  getMyRegisters,
  registers: getMyRegisters,
  openRegister: (registerId, openingCashMinor, config = {}) => apiClient.post(`/pos/registers/${registerId}/open`, { opening_cash_minor: openingCashMinor }, config),
  getSession: (registerId, config = {}) => apiClient.get(`/pos/registers/${registerId}/session`, config),
  closeRegister: (registerId, countedCashMinor) => apiClient.post(`/pos/registers/${registerId}/close`, { counted_cash_minor: countedCashMinor }),
  cashMovement: (registerId, payload) => apiClient.post(`/pos/registers/${registerId}/cash-movements`, payload),
  searchProducts: (q, registerId, params = {}) => apiClient.get("/pos/products/search", { params: { q, register_id: registerId, limit: 20, ...params } }),
  lookupBarcode: (code, registerId, config = {}) => apiClient.get("/pos/products/lookup", { ...config, params: { code, register_id: registerId } }),
  scan: (code, registerId, config = {}) => apiClient.post("/pos/scan", { code, register_id: registerId }, config),
  inventory: (variantId, registerId) => apiClient.get(`/pos/inventory/${variantId}`, { params: { register_id: registerId } }),
  searchCustomers: (q, registerId) => apiClient.get("/pos/customers/search", { params: { q, register_id: registerId } }),
  getCustomer: (id, registerId) => apiClient.get(`/pos/customers/${id}`, { params: { register_id: registerId } }),
  createCustomer: (payload) => apiClient.post("/pos/customers", payload),
  createCart: (payload) => apiClient.post("/pos/carts", payload),
  updateCart: (id, payload) => apiClient.post(`/pos/carts/${id}`, payload),
  voidCart: (id) => apiClient.delete(`/pos/carts/${id}`),
  holdCart: (id) => apiClient.post(`/pos/carts/${id}/hold`),
  resumeCart: (id) => apiClient.post(`/pos/carts/${id}/resume`),
  applyPromotion: (id, code) => apiClient.post(`/pos/carts/${id}/promotions`, { code }),
  checkout: (id, payload, idempotencyKey) => apiClient.post(`/pos/carts/${id}/checkout`, payload, { headers: { "Idempotency-Key": idempotencyKey } }),
  listOrders: (params = {}) => apiClient.get("/pos/orders", { params }),
  getOrder: (id) => apiClient.get(`/pos/orders/${id}`),
  getReceipt: (id) => apiClient.get(`/pos/transactions/${id}/receipt`),
  markReceiptPrinted: (id) => apiClient.post(`/pos/transactions/${id}/receipt/mark-printed`),
  emailReceipt: (id, email) => apiClient.post(`/pos/transactions/${id}/receipt/email`, { email }),
  previewReturn: (orderId, items) => apiClient.post(`/pos/orders/${orderId}/return/preview`, { items }),
  createReturn: (orderId, payload) => apiClient.post(`/pos/orders/${orderId}/return`, payload),
};
