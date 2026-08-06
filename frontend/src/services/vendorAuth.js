const VENDOR_AUTH_KEYS = [
  "vendor_token",
  "vendor_user",
  "vendor_staff",
  "seller_token",
  "seller_user",
  "seller_staff",
  "marketplace_vendor",
  "marketplace_vendor_token",
  "vendor_auth",
  "seller_auth",
];

function readStorage(storage, key) {
  try {
    return storage?.getItem(key) || null;
  } catch {
    return null;
  }
}

function removeStorage(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

export const vendorAuth = {
  getToken() {
    if (typeof window === "undefined") return null;

    return (
      readStorage(window.localStorage, "vendor_token") ||
      readStorage(window.localStorage, "seller_token") ||
      readStorage(window.localStorage, "marketplace_vendor_token") ||
      readStorage(window.sessionStorage, "vendor_token") ||
      readStorage(window.sessionStorage, "seller_token")
    );
  },

  getVendor() {
    if (typeof window === "undefined") return null;

    const raw =
      readStorage(window.localStorage, "vendor_user") ||
      readStorage(window.localStorage, "seller_user") ||
      readStorage(window.localStorage, "marketplace_vendor");

    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clear() {
    if (typeof window === "undefined") return;

    VENDOR_AUTH_KEYS.forEach((key) => removeStorage(window.localStorage, key));
    removeStorage(window.sessionStorage, "vendor_token");
    removeStorage(window.sessionStorage, "seller_token");
  },
};

export default vendorAuth;
