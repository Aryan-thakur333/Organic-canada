import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { authService } from '../../services/medusa/authService';
import { b2bApi } from '../../services/b2bApi';
import { loginSuccess, authResolved } from '../../redux/authSlice';
import { setUserProfile } from '../../redux/userSlice';
import { clearCustomerToken, getCustomerToken } from '../../services/medusa/tokenStorage';
import { mapCustomerToProfile } from '../../utils/customerProfile';
import { firebaseAuthService, syncWithMedusa } from '../../services/firebaseAuthService';
import { useRef } from 'react';

function isCanceled(error) {
  return Boolean(
    error?.name === 'AbortError' ||
    error?.name === 'CanceledError' ||
    error?.code === 'ERR_CANCELED' ||
    error?.message === 'canceled' ||
    String(error?.message || '').toLowerCase().includes('aborted')
  );
}

/**
 * Restores the Medusa customer session once on app startup.
 *
 * Route guards read auth.authResolved, so they wait until this check has
 * either restored Redux auth state or confirmed there is no usable token.
 */
const AuthSync = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, authResolved: isResolved } = useSelector(
    (state) => state.auth
  );
  
  const redirectHandledRef = useRef(false);

  useEffect(() => {
    if (redirectHandledRef.current) return;
    redirectHandledRef.current = true;

    let cancelled = false;

    async function handleRedirectResult() {
      const pending = sessionStorage.getItem("google_auth_redirect_pending") === "true";
      if (!pending) return;

      try {
        const result = await firebaseAuthService.consumeGoogleRedirectResult();
        sessionStorage.removeItem("google_auth_redirect_pending");

        if (!result || cancelled) return;

        console.info("[AuthSync] Processing Google redirect result...");
        
        // Medusa Sync
        const medusaUser = await syncWithMedusa(result.firebaseUser);
        
        // Clear legacy B2B state strictly before logging in B2C Google users
        ['b2b_company', 'b2b_company_id', 'b2b_customer', 'b2b_status', 'b2b_auth_mode', 'b2b_registration_draft', 'selected_account_type'].forEach(key => localStorage.removeItem(key));

        const token = getCustomerToken();
        if (token && medusaUser && !cancelled) {
          dispatch(loginSuccess({ token, user: medusaUser }));
          dispatch(setUserProfile(mapCustomerToProfile(medusaUser)));
        }
      } catch (error) {
        sessionStorage.removeItem("google_auth_redirect_pending");
        console.error("[GOOGLE_REDIRECT_ERROR]", error);
      }
    }

    handleRedirectResult();

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated || isResolved) return undefined;

    const controller = new AbortController();
    let mounted = true;

    const restoreSession = async () => {
      const tokenAtStart = getCustomerToken();
      if (!tokenAtStart) {
        if (mounted) dispatch(authResolved());
        return;
      }

      try {
        const response = await authService.getCurrentCustomer({
          signal: controller.signal,
        });
        const customer = response?.customer;
        if (customer) {
          dispatch(loginSuccess({ token: tokenAtStart, user: customer }));
          dispatch(setUserProfile(mapCustomerToProfile(customer)));
          try {
            await b2bApi.getCompany({ signal: controller.signal, forceRefresh: true });
          } catch (companyError) {
            if (
              !isCanceled(companyError) &&
              companyError?.response?.status !== 404 &&
              companyError?.response?.status !== 403
            ) {
              console.warn('[AuthSync] B2B company restore skipped:', companyError?.message || companyError);
            }
          }
        }
      } catch (error) {
        const tokenStillMatches = getCustomerToken() === tokenAtStart;
        if (!isCanceled(error) && error?.response?.status === 401 && tokenStillMatches) {
          clearCustomerToken();
        }
      } finally {
        if (mounted) {
          dispatch(authResolved());
        }
      }
    };

    restoreSession();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [dispatch, isAuthenticated, isResolved]);

  return null;
};

export default AuthSync;
