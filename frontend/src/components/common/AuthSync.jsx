import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { authService } from '../../services/medusa/authService';
import { loginSuccess, authResolved } from '../../redux/authSlice';
import { setUserProfile } from '../../redux/userSlice';
import { clearCustomerToken, getCustomerToken } from '../../services/medusa/tokenStorage';
import { mapCustomerToProfile } from '../../utils/customerProfile';

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
