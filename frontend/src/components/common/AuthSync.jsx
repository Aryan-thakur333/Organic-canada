import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { authService } from '../../services/medusa/authService';
import { loginSuccess, authResolved } from '../../redux/authSlice';
import { setUserProfile } from '../../redux/userSlice';

/**
 * AuthSync — Restores Medusa session on app mount.
 *
 * Checks localStorage for a stored JWT and fetches /store/customers/me.
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

      const hasToken = localStorage.getItem('medusa_token');
      if (!hasToken) {
        dispatch(authResolved());
        return;
      }

      try {
        const { customer } = await authService.getCurrentCustomer();
        if (customer) {
          dispatch(loginSuccess({ user: customer }));
          dispatch(
            setUserProfile({
              id: customer.id,
              name:
                `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
                customer.email,
              email: customer.email,
              phone: customer.phone || '',
            })
          );
        }
      } catch {
        // Token is stale or invalid — clean up silently
        localStorage.removeItem('medusa_token');
        localStorage.removeItem('medusa_jwt');
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
