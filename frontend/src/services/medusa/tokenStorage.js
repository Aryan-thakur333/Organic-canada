export const CUSTOMER_TOKEN_KEY = 'medusa_customer_token';
export const VENDOR_TOKEN_KEY = 'vendor_token';

const LEGACY_CUSTOMER_TOKEN_KEYS = ['medusa_token', 'medusa_jwt'];

/**
 * B2B Session Persistence Guard
 * 
 * Reads the active authentication layer profile variables directly from
 * standard storage blocks (localStorage), preventing layout routing
 * parameters from automatically defaulting or redirecting back to standard
 * client channels during transient 401 validation glitches.
 */
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

/**
 * B2B Session Token Safety Gate
 * 
 * Enforces that all connection headers utilize explicit fallback verification
 * mapping lookups. If a dynamic browser switch triggers a temporary 401
 * validation glitch under active login routes, the token is read directly
 * from storage to intercept the crash trace before routing contexts catch it.
 */
export function getCustomerTokenSafe() {
  try {
    const token = getCustomerToken();
    if (!token) return null;
    
    // Verify token structure before returning
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('[TokenStorage] Invalid token structure detected, clearing cache');
      clearCustomerToken();
      return null;
    }
    
    return token;
  } catch (error) {
    console.error('[TokenStorage] Error reading token from storage:', error);
    return null;
  }
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

/**
 * B2B Session Persistence Check
 * 
 * Returns true if a valid customer token exists in storage, indicating an
 * active B2B session that should not be disrupted by routing transitions.
 */
export function hasActiveSession() {
  return Boolean(getCustomerTokenSafe());
}

/**
 * B2B Company Context Persistence
 * 
 * Stores company context in sessionStorage to survive page refreshes and
 * routing transitions without relying on ephemeral auth context.
 */
const B2B_COMPANY_CONTEXT_KEY = 'b2b_company_context';

export function getB2BCompanyContext() {
  try {
    const context = sessionStorage.getItem(B2B_COMPANY_CONTEXT_KEY);
    if (!context) return null;
    return JSON.parse(context);
  } catch (error) {
    console.error('[TokenStorage] Error reading B2B company context:', error);
    return null;
  }
}

export function setB2BCompanyContext(context) {
  try {
    if (!context) {
      sessionStorage.removeItem(B2B_COMPANY_CONTEXT_KEY);
      return;
    }
    sessionStorage.setItem(B2B_COMPANY_CONTEXT_KEY, JSON.stringify(context));
  } catch (error) {
    console.error('[TokenStorage] Error saving B2B company context:', error);
  }
}

export function clearB2BCompanyContext() {
  sessionStorage.removeItem(B2B_COMPANY_CONTEXT_KEY);
}