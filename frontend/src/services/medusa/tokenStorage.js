export const CUSTOMER_TOKEN_KEY = 'medusa_customer_token';
export const VENDOR_TOKEN_KEY = 'vendor_token';

const LEGACY_CUSTOMER_TOKEN_KEYS = ['medusa_token', 'medusa_jwt'];

export function getCustomerToken() {
  const current = localStorage.getItem(CUSTOMER_TOKEN_KEY);
  if (current) return current;

  const legacy = LEGACY_CUSTOMER_TOKEN_KEYS
    .map((key) => localStorage.getItem(key))
    .find(Boolean);
  if (legacy) {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, legacy);
    LEGACY_CUSTOMER_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  }
  return legacy || null;
}

export function setCustomerToken(token) {
  if (!token) return;
  localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  LEGACY_CUSTOMER_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function clearCustomerToken() {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  LEGACY_CUSTOMER_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
}
