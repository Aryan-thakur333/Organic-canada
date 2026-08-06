import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
} from 'firebase/auth';

import { auth, googleProvider } from '../firebase/firebase';
import { authService } from './medusa/authService';
import { checkBackendHealth } from './apiClient';
import { clearCustomerToken, getCustomerToken } from './medusa/tokenStorage';

const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 5000,
};

const syncRequests = new Map();
let googleSignInRequest;

/**
 * Retry an async function with exponential backoff + random jitter.
 * Only retries transient transport/server failures. Authentication failures
 * are deterministic and must never be replayed.
 */
export async function withRetry(fn, config = RETRY_CONFIG) {
  let lastError;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const isRetryable =
        !error.response ||
        error.code === 'ERR_NETWORK' ||
        status === 408 ||
        status === 429 ||
        status >= 500;

      if (attempt === config.maxAttempts || !isRetryable) break;

      const delay = Math.min(
        config.baseDelay * Math.pow(2, attempt - 1) +
          Math.random() * config.baseDelay,
        config.maxDelay
      );
      console.log(
        `[FirebaseAuth] Retry ${attempt}/${config.maxAttempts} after ${Math.round(delay)}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/* -------------------------------------------------------------------------- */
/*                          FIREBASE AUTH SERVICE                             */
/* -------------------------------------------------------------------------- */

export const firebaseAuthService = {
  /**
   * PURE FIREBASE: Launch Google popup authentication.
   */
  async signInWithGooglePopup() {
    const credential = await signInWithPopup(auth, googleProvider);
    const firebaseUser = credential?.user;

    if (!firebaseUser) {
      throw new Error('Google authentication returned no user.');
    }

    const idToken = await firebaseUser.getIdToken(true);

    return {
      firebaseUser,
      idToken,
      email: firebaseUser.email,
      firstName: firebaseUser.displayName?.split(' ')[0] || '',
      lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
      photoURL: firebaseUser.photoURL || null,
    };
  },

  /**
   * PURE FIREBASE: Redirect authentication fallback.
   */
  async startGoogleRedirect() {
    sessionStorage.setItem("google_auth_redirect_pending", "true");
    return signInWithRedirect(auth, googleProvider);
  },

  /**
   * PURE FIREBASE: Consume redirect result exactly once on mount.
   */
  async consumeGoogleRedirectResult() {
    const result = await getRedirectResult(auth);
    if (!result?.user) return null;

    const idToken = await result.user.getIdToken(true);

    return {
      firebaseUser: result.user,
      idToken,
      email: result.user.email,
      firstName: result.user.displayName?.split(' ')[0] || '',
      lastName: result.user.displayName?.split(' ').slice(1).join(' ') || '',
      photoURL: result.user.photoURL || null,
    };
  },

  /**
   * ERROR MAPPER: Handles Firebase-specific UI codes.
   */
  handleGoogleAuthError(error, setError) {
    const code = String(error?.code || "");

    if (code === "auth/popup-closed-by-user") {
      console.info("[FirebaseAuthService] Google sign-in was cancelled by user.");
      setError("Google sign-in was cancelled. Please try again and complete the Google window.");
      return;
    }

    if (code === "auth/cancelled-popup-request") {
      console.info("[FirebaseAuthService] Duplicate popup request ignored.");
      setError("Another Google sign-in request was already open.");
      return;
    }

    if (code === "auth/popup-blocked") {
      console.info("[FirebaseAuthService] Popup blocked. Initiating redirect fallback.");
      this.startGoogleRedirect();
      return;
    }

    setError(error?.message || "Google sign-in could not be completed.");
  },

  /**
   * Logout from both Firebase and Medusa.
   */
  async logout() {
    const results = await Promise.allSettled([
      firebaseSignOut(auth),
      authService.logout(),
    ]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) console.error('[FirebaseAuthService] Logout Error:', failed.reason);
    return !failed;
  },
};

/* -------------------------------------------------------------------------- */
/*                     MEDUSA CUSTOMER SYNC (Firebase bridge)                 */
/* -------------------------------------------------------------------------- */

/**
 * Sync a Firebase-authenticated user with Medusa.
 *
 * Strategy:
 *   1. Pre-flight health check — fail fast if backend is unreachable
 *   2. Try LOGIN with { email, password: firebaseUid } — works if user already synced
 *   3. If login fails → REGISTER a new customer with the same credentials
 *   4. Login again after registration to get a fresh session
 *   5. Return the Medusa customer object
 */
export async function syncWithMedusa(firebaseUser) {
  if (!firebaseUser?.uid || !firebaseUser?.email) {
    throw new Error('Firebase user is missing a verified email or identifier.');
  }

  const key = `${firebaseUser.uid}:${firebaseUser.email.toLowerCase()}`;
  if (syncRequests.has(key)) return syncRequests.get(key);

  const request = syncWithMedusaOnce(firebaseUser).finally(() => {
    syncRequests.delete(key);
  });
  syncRequests.set(key, request);
  return request;
}

async function syncWithMedusaOnce(firebaseUser) {
  // 0. Pre-flight health check
  try {
    await checkBackendHealth();
  } catch {
    throw new Error('Backend server is offline. Please start Medusa.');
  }

  const email = firebaseUser.email.trim().toLowerCase();
  const bridgePassword = firebaseUser.uid;
  const displayName = firebaseUser.displayName || '';
  const names = displayName.trim().split(/\s+/).filter(Boolean);
  const firstName = names[0] || 'Google';
  const lastName = names.slice(1).join(' ') || 'User';

  let loginResponse;
  try {
    loginResponse = await authService.login(email, bridgePassword);
  } catch (error) {
    if (![400, 401].includes(error.response?.status)) throw error;

    await authService.register({
      email,
      password: bridgePassword,
      first_name: firstName,
      last_name: lastName,
      phone: firebaseUser.phoneNumber || '',
    });
  }

  if (loginResponse && !getCustomerToken()) {
    throw new Error('Medusa login succeeded without returning a customer token.');
  }

  try {
    const { customer } = await authService.getCurrentCustomer();
    if (!customer) throw new Error('Medusa customer profile is missing.');
    return customer;
  } catch (error) {
    if (error.response?.status === 401 || error.code === 'AUTH_REQUIRED') {
      clearCustomerToken();
      throw new Error('Medusa customer session was rejected. Please sign in again.');
    }
    throw error;
  }
}
