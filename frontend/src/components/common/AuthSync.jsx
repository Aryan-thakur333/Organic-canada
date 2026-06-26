import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { authService } from '../../services/medusa/authService';
import { loginSuccess, authResolved } from '../../redux/authSlice';
import { setUserProfile } from '../../redux/userSlice';
import { clearCustomerToken, getCustomerToken } from '../../services/medusa/tokenStorage';
import { mapCustomerToProfile } from '../../utils/customerProfile';

/**
 * AuthSync — Restores Medusa session on app mount.
 *
 * Checks medusa_customer_token and fetches /store/customers/me.
 * If valid → updates Redux state. If stale → clears the token.
 *
 * No Firebase listener needed — Firebase popup login handles its own sync
 * via firebaseAuthService.syncWithMedusa().
 */
const AuthSync = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, authResolved: isResolved } = useSelector(
    (state) => state.auth
  );
  const syncLock = useRef(false);

  useEffect(() => {
    // Already authenticated or already resolved → nothing to do
    if (isAuthenticated || isResolved) return;

    const restoreSession = async () => {
      if (syncLock.current) return;
      syncLock.current = true;

      const hasToken = getCustomerToken();
      if (!hasToken) {
        dispatch(authResolved());
        return;
      }

      try {
        const { customer } = await authService.getCurrentCustomer();
        if (customer) {
          dispatch(loginSuccess({ user: customer }));
          dispatch(
            setUserProfile(mapCustomerToProfile(customer))
          );
        }
      } catch {
        // Token is stale or invalid — clean up silently
        clearCustomerToken();
      } finally {
        syncLock.current = false;
        dispatch(authResolved());
      }
    };

    restoreSession();
  }, [dispatch, isAuthenticated, isResolved]);

  return null;
};

export default AuthSync;
