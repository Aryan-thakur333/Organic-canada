import { useDispatch, useSelector } from 'react-redux';
import { loginFailure, clearAuthError, logout } from '../redux/authSlice';
import { clearUserProfile } from '../redux/userSlice';
import { firebaseAuthService } from '../services/firebaseAuthService';

/**
 * Simplified useAuth hook — provides logout + error handling.
 * Email/Google auth is handled directly by authService / firebaseAuthService.
 */
export default function useAuth() {
  const dispatch = useDispatch();
  const auth = useSelector((state) => state.auth);

  const signOut = async () => {
    await firebaseAuthService.logout();
    dispatch(logout());
    dispatch(clearUserProfile());
  };

  const clearError = () => {
    dispatch(clearAuthError());
  };

  return {
    ...auth,
    signOut,
    clearError,
  };
}
