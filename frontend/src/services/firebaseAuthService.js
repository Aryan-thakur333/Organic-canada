import {
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';

import { auth, googleProvider } from '../firebase/firebase';
import { authService } from './medusa/authService';
import { checkBackendHealth } from './apiClient';

/* -------------------------------------------------------------------------- */
/*                         RETRY UTILITY (3 attempts + jitter)                */
/* -------------------------------------------------------------------------- */

const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 5000,
};

/**
 * Retry an async function with exponential backoff + random jitter.
 * Only retries on network errors and 401s.
 */
export async function withRetry(fn, config = RETRY_CONFIG) {
  let lastError;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable =
        !error.response ||
        error.code === 'ERR_NETWORK' ||
        error.response?.status === 401;

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
        token: localStorage.getItem('medusa_token'),
      };
    } catch (error) {
      console.error('[FirebaseAuthService] Google Sign-In Error:', error);
      throw new Error(error?.message || 'Google authentication failed');
    }
  },

  /**
   * Logout from both Firebase and Medusa.
   */
  async logout() {
    try {
      // 1. Sign out from Firebase
      await firebaseSignOut(auth);

      // 2. Clear Medusa session
      await authService.logout();

      console.log('[FirebaseAuthService] Logged out successfully.');
      return true;
    } catch (error) {
      console.error('[FirebaseAuthService] Logout Error:', error);
      return false;
    }
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
  // 0. Pre-flight health check
  try {
    await checkBackendHealth();
  } catch {
    throw new Error('Backend server is offline. Please start Medusa.');
  }

  const email = firebaseUser.email;
  const password = firebaseUser.uid; // Bridge: Firebase UID as password

  try {
    // ---- LOGIN FLOW ----
    await withRetry(() => authService.login(email, password));
    const { customer } = await authService.getCurrentCustomer();
    return customer;
  } catch {
    // ---- REGISTER FLOW (user doesn't exist yet) ----
    console.log('[FirebaseAuthService] User not found. Creating account...');

    const displayName = firebaseUser.displayName || '';
    const names = displayName.split(' ');
    const firstName = names[0] || 'Google';
    const lastName = names.slice(1).join(' ') || 'User';

    await withRetry(() =>
      authService.register({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        phone: firebaseUser.phoneNumber || '',
      })
    );

    // Login again to get a fresh session after registration
    await withRetry(() => authService.login(email, password));
    const { customer } = await authService.getCurrentCustomer();
    return customer;
  }
}
