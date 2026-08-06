const POS_MESSAGES = {
  POS_AUTH_REQUIRED: "Sign in to continue to POS.",
  POS_UNAUTHENTICATED: "Sign in to continue to POS.",
  POS_OPERATOR_NOT_FOUND: "Your POS operator profile could not be found. Contact an administrator.",
  POS_OPERATOR_NOT_ASSIGNED: "You are not assigned to the selected register.",
  POS_OPERATOR_NOT_ASSIGNED_TO_REGISTER: "You are not assigned to the selected register.",
  POS_ASSIGNMENT_INACTIVE: "Your assignment to this register is inactive. Contact an administrator.",
  POS_REGISTER_SCOPE_MISMATCH: "Your assignment does not match this register location.",
  POS_SESSION_NOT_OPEN: "Open the register session before scanning products.",
  POS_SESSION_OPEN_BY_OTHER_OPERATOR: "This register is currently open under another operator.",
  POS_OPERATOR_HAS_OTHER_OPEN_SESSION: "You already have an open session on another register.",
  POS_OPERATOR_SESSION_ALREADY_OPEN: "You already have an open session on another register.",
  POS_PRODUCT_NOT_FOUND: "No matching product found.",
  POS_REGISTER_ID_MISSING: "Operator is not assigned to this register.",
  POS_REGISTER_NOT_ASSIGNED: "Operator is not assigned to this register.",
  POS_REGISTER_INACTIVE: "This register is inactive.",
  POS_REGISTER_SESSION_MISMATCH: "Your active POS session belongs to another register.",
  POS_REGISTER_SESSION_REQUIRED: "Open a register session before selling.",
  POS_REGISTER_SALES_CHANNEL_MISSING: "This register is missing a sales channel configuration.",
  POS_REGISTER_LOCATION_MISSING: "This register is missing a stock location configuration.",
  POS_PRODUCT_NOT_IN_CHANNEL: "This product is not enabled for the selected POS register.",
  POS_PRODUCT_NOT_IN_SALES_CHANNEL: "This product is not available in the selected POS sales channel.",
  POS_VARIANT_NOT_IN_SALES_CHANNEL: "Product is not available in this POS location.",
  POS_PRICE_NOT_AVAILABLE: "This product has no USD price for the USA register.",
  POS_PRICE_UNAVAILABLE: "This product has no valid price for the selected register currency.",
  POS_CURRENCY_MISMATCH: "This product price does not match the selected register currency.",
  POS_INVENTORY_UNAVAILABLE: "Inventory is unavailable at the selected POS location.",
  POS_INVENTORY_UNKNOWN: "Inventory could not be verified for this location.",
  POS_INSUFFICIENT_INVENTORY: "This product is out of stock at this POS location.",
  POS_OUT_OF_STOCK: "This product is out of stock at this POS location.",
  POS_LOOKUP_RATE_LIMITED: "Barcode lookups are temporarily rate limited. Wait briefly and retry.",
  BACKEND_OFFLINE: "POS backend is unavailable. Start the backend and retry.",
};

export function posErrorCode(error) {
  if (error?.code === "BACKEND_OFFLINE" || error?.code === "ERR_NETWORK" || error?.message?.includes("ERR_CONNECTION_REFUSED")) return "BACKEND_OFFLINE";
  return error?.response?.data?.code || error?.code || "POS_LOOKUP_FAILED";
}

export function posErrorMessage(error, registerCurrency = "usd") {
  const code = posErrorCode(error);
  if (code === "POS_PRICE_NOT_AVAILABLE" && String(registerCurrency).toLowerCase() !== "usd") return "This product has no price for the selected register region.";
  return POS_MESSAGES[code] || error?.response?.data?.message || error?.message || "Unable to look up this barcode.";
}

export function posAccessResolution(error) {
  const code = posErrorCode(error);
  if (["POS_AUTH_REQUIRED", "POS_UNAUTHENTICATED"].includes(code) || error?.response?.status === 401) return { code, action: "LOGIN" };
  if (["POS_REGISTER_NOT_ASSIGNED", "POS_OPERATOR_NOT_ASSIGNED", "POS_OPERATOR_NOT_ASSIGNED_TO_REGISTER", "POS_REGISTER_SESSION_REQUIRED", "POS_SESSION_NOT_OPEN"].includes(code)) return { code, action: "REGISTER_SELECT" };
  if (code === "POS_REGISTER_SESSION_MISMATCH") return { code, action: "REFRESH_SESSION" };
  return { code, action: "ERROR", message: posErrorMessage(error) };
}
