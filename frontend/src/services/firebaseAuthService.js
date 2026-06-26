import {
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';

import { auth, googleProvider } from '../firebase/firebase';
import { authService } from './medusa/authService';
import { checkBackendHealth } from './apiClient';
import { clearCustomerToken, getCustomerToken } from './medusa/tokenStorage';

/* -------------------------------------------------------------------------- */
/*                         RETRY UTILITY (3 attempts + jitter)                */
/* -------------------------------------------------------------------------- */

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
   * Google Sign-In via Firebase → sync user with Medusa.
   */
  async signInWithGoogle() {
    if (googleSignInRequest) return googleSignInRequest;

    googleSignInRequest = (async () => {
      try {
      // Firebase popup login
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;

      if (!firebaseUser?.email) {
        throw new Error('Google account email not found');
      }

      // Sync with Medusa (bridge login or register)
      const medusaUser = await syncWithMedusa(firebaseUser);

      return {
        firebaseUser,
        medusaUser,
        token: getCustomerToken(),
      };
      } catch (error) {
        console.error('[FirebaseAuthService] Google Sign-In Error:', error);
        throw new Error(error?.response?.data?.message || error?.message || 'Google authentication failed');
      } finally {
        googleSignInRequest = undefined;
      }
    })();
    return googleSignInRequest;
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
