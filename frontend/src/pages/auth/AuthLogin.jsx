import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { User, Store, Building2 } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthHeader from '../../components/auth/AuthHeader';
import LoginForm from '../../components/auth/LoginForm';
import AuthAlert from '../../components/auth/AuthAlert';
import AuthFooter from '../../components/auth/AuthFooter';

import { authService } from '../../services/medusa/authService';
import { vendorApi } from '../../services/vendorApi';
import { b2bApi } from '../../services/b2bApi';
import { firebaseAuthService, syncWithMedusa } from '../../services/firebaseAuthService';

import { loginSuccess, loginFailure, authStart, authResolved } from '../../redux/authSlice';
import { setUserProfile } from '../../redux/userSlice';
import { loginSuccess as vendorLoginSuccess } from '../../redux/vendorSlice';
import { mapCustomerToProfile } from '../../utils/customerProfile';
import { applyCustomerTokenToApiClient } from '../../services/apiClient';
import GoogleAuthButton from '../../components/auth/GoogleAuthButton';

const isGoogleCustomerAuthEnabled = import.meta.env.VITE_ENABLE_CUSTOMER_GOOGLE_AUTH === "true";

const ROLE_CONFIG = {
  customer: {
    title: 'Welcome Back',
    subtitle: 'Sign in to continue shopping',
    icon: User,
    registerText: 'New to Organic Canada? Create an account',
    registerRoute: '/auth/register/customer',
    defaultRedirect: '/profile'
  },
  seller: {
    title: 'Seller Portal',
    subtitle: 'Sign in to manage products, inventory, and orders',
    icon: Store,
    registerText: 'Want to sell with us? Become a seller',
    registerRoute: '/auth/register/seller',
    defaultRedirect: '/vendor/dashboard'
  },
  b2b: {
    title: 'B2B Portal',
    subtitle: 'Sign in to manage your company purchases',
    icon: Building2,
    registerText: 'Need a business account? Register your company',
    registerRoute: '/auth/register/b2b',
    defaultRedirect: '/b2b/dashboard'
  }
};

const sanitizeReturnUrl = (url) => {
  if (!url) return null;
  try {
    const decodedUrl = decodeURIComponent(url);
    if (!decodedUrl.startsWith('/')) return null;
    if (decodedUrl.startsWith('//')) return null;
    if (decodedUrl.toLowerCase().includes('javascript:')) return null;
    if (decodedUrl.toLowerCase().startsWith('data:')) return null;
    return decodedUrl;
  } catch (e) {
    return null;
  }
};

const AuthLogin = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const searchParams = new URLSearchParams(location.search);
  const rawRole = searchParams.get('role');
  const returnUrlParam = searchParams.get('returnUrl');
  const role = ROLE_CONFIG[rawRole] ? rawRole : null;
  const isCustomer = role === "customer";
  const showGoogleAuth = isCustomer && isGoogleCustomerAuthEnabled;

  useEffect(() => {
    if (!role) {
      let url = '/auth';
      if (returnUrlParam) url += `?returnUrl=${encodeURIComponent(returnUrlParam)}`;
      navigate(url, { replace: true });
    }
  }, [role, navigate, returnUrlParam]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [alertState, setAlertState] = useState(null);
  const [wrongPortalRole, setWrongPortalRole] = useState(null);
  
  const submitInFlight = useRef(false);

  const performPostLoginChecks = async (roleType, token, medusaCustomer) => {
    try {
      if (roleType === 'seller') {
        const vendorData = await vendorApi.getMe();
        console.info("[SELLER_ME_RESULT]", {
          vendorId: vendorData?.id || null,
          email: vendorData?.email || null,
          status: vendorData?.status || null,
        });
        if (vendorData) {
          const status = vendorData.status;
          if (status === 'approved' || status === 'active' || status === 'pending' || status === 'rejected') {
            return { redirect: '/vendor/dashboard' };
          } else if (status === 'suspended') {
            throw new Error('This account has been suspended.');
          }
        }
        return { redirect: '/vendor/dashboard' };
      } 
      
      if (roleType === 'b2b') {
        b2bApi.clearCompanyCache();
        const res = await b2bApi.getCompany({ forceRefresh: true });
        const c = res?.company;
        
        if (!c) {
          return { redirect: '/auth/register/b2b' }; // No company
        }
        if (c.status === 'approved' || c.status === 'active') {
          return { redirect: '/b2b/dashboard' };
        }
        if (['pending', 'rejected', 'suspended'].includes(c.status)) {
          return { redirect: `/b2b/${c.status}` };
        }
        return { redirect: '/b2b/dashboard' };
      }
      
      // Customer
      return { redirect: null };
      
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Verification failed';
      throw new Error(msg);
    }
  };

  const handleGoogleSignIn = async () => {
    if (submitInFlight.current || isLoading) return;
    submitInFlight.current = true;
    
    try {
      setIsGoogleLoading(true);
      setAlertState(null);
      setWrongPortalRole(null);
      dispatch(authStart());
      
      const result = await firebaseAuthService.signInWithGooglePopup();
      const medusaUser = await syncWithMedusa(result.firebaseUser);
      
      // Clean up stale legacy keys
      ['b2b_company', 'b2b_company_id', 'b2b_customer', 'b2b_status', 'b2b_auth_mode', 'b2b_registration_draft', 'selected_account_type'].forEach(key => localStorage.removeItem(key));
      
      const { getCustomerToken } = await import("../../services/medusa/tokenStorage");
      const token = getCustomerToken();
      if (!token) throw new Error("Google sign-in succeeded, but no session token was established.");
      
      applyCustomerTokenToApiClient(token);
      dispatch(loginSuccess({ user: medusaUser, token }));
      dispatch(setUserProfile(mapCustomerToProfile(medusaUser)));
      dispatch(authResolved());

      const safeReturnUrl = sanitizeReturnUrl(returnUrlParam);
      const finalRedirect = safeReturnUrl || ROLE_CONFIG['customer'].defaultRedirect;
      
      navigate(finalRedirect, { replace: true });
      
    } catch (error) {
      console.error('[AuthLogin] Google sign-in failed:', error);
      firebaseAuthService.handleGoogleAuthError(error, (msg) => {
        setAlertState({ type: 'error', message: msg });
        dispatch(loginFailure(msg));
      });
    } finally {
      setIsGoogleLoading(false);
      submitInFlight.current = false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || isLoading || isGoogleLoading || submitInFlight.current) return;
    
    submitInFlight.current = true;
    setIsLoading(true);
    setAlertState(null);
    setWrongPortalRole(null);

    dispatch(authStart());

    try {
      let authResponse;
      let token;
      
      if (role === 'seller') {
        console.info("[SELLER_LOGIN_ATTEMPT]", { email, endpoint: "/vendor/login" });
        authResponse = await vendorApi.login({ email, password });
        token = authResponse?.token;
        console.info("[SELLER_LOGIN_RESULT]", {
          status: "success",
          authenticated: true,
          vendorIdPresent: Boolean(authResponse?.vendor?.id),
          tokenPresent: Boolean(token),
        });
        dispatch(vendorLoginSuccess(authResponse));
      } else if (role === 'b2b' || role === 'customer') {
        authResponse = await authService.login(email, password);
        token = authResponse?.token;
        if (!token) throw new Error('Login succeeded but no token was returned.');
        
        applyCustomerTokenToApiClient(token);
        const profileData = await authService.getCurrentCustomer();
        const customer = profileData.customer;
        
        // Clear old localStorage keys
        ['b2b_company', 'b2b_company_id', 'b2b_customer', 'b2b_status'].forEach(key => localStorage.removeItem(key));
        
        dispatch(loginSuccess({ token, user: customer }));
        dispatch(setUserProfile(mapCustomerToProfile(customer)));
        dispatch(authResolved());
      }
      
      const { redirect } = await performPostLoginChecks(role, token);
      
      // Safe Return URL processing
      const safeReturnUrl = sanitizeReturnUrl(returnUrlParam);
      const finalRedirect = safeReturnUrl || redirect || ROLE_CONFIG[role].defaultRedirect;
      
      navigate(finalRedirect, { replace: true });
      
    } catch (err) {
      dispatch(authResolved());
      dispatch(loginFailure(err.message));
      
      let message = err?.response?.data?.message || err?.message || 'Authentication failed';
      const status = err?.response?.status;
      
      if (status === 401) {
        message = "Invalid email or password";
      } else if (status === 429) {
        message = "System security delay active. Please wait a moment and try again.";
      }
      
      if (message.includes('seller account')) {
        setWrongPortalRole('seller');
        setAlertState({ type: 'error', message: "This account belongs to the Seller Portal." });
      } else if (message.includes('b2b account')) {
        setWrongPortalRole('b2b');
        setAlertState({ type: 'error', message: "This account belongs to the B2B Portal." });
      } else {
        setAlertState({ type: 'error', message });
      }
    } finally {
      setIsLoading(false);
      submitInFlight.current = false;
    }
  };

  if (!role) return null;

  const config = ROLE_CONFIG[role];
  const urlQuery = returnUrlParam ? `?returnUrl=${encodeURIComponent(returnUrlParam)}` : "";

  return (
    <AuthLayout
      title="Fresh, local, and organic."
      subtitle="Sign in to continue your organic journey."
    >
      <AuthHeader 
        title={config.title}
        subtitle={config.subtitle}
        icon={config.icon}
      />

      <AuthAlert {...(alertState || {})} />

      {wrongPortalRole ? (
        <div className="flex flex-col gap-3">
          <Link 
            to={`/auth/login?role=${wrongPortalRole}${returnUrlParam ? '&returnUrl='+encodeURIComponent(returnUrlParam) : ''}`}
            className="w-full flex items-center justify-center h-[48px] rounded-2xl font-bold text-white bg-[#594236] hover:bg-[#4A372D]"
          >
            Continue to {wrongPortalRole === 'seller' ? 'Seller' : 'B2B'} Login
          </Link>
          <Link 
            to={`/auth${urlQuery}`}
            className="w-full flex items-center justify-center h-[48px] rounded-2xl font-bold text-stone-700 bg-stone-50 hover:bg-stone-100"
          >
            Choose Another Account Type
          </Link>
        </div>
      ) : (
        <>
          <LoginForm
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            onSubmit={handleSubmit}
            isLoading={isLoading || isGoogleLoading}
            showForgotPassword={true}
          />

          {showGoogleAuth && (
            <>
              <div className="my-5 flex items-center gap-3" aria-hidden="true">
                <div className="h-px flex-1 bg-stone-200" />
                <span className="text-xs font-medium uppercase tracking-wider text-stone-400">
                  or continue with
                </span>
                <div className="h-px flex-1 bg-stone-200" />
              </div>

              <GoogleAuthButton
                onClick={handleGoogleSignIn}
                isLoading={isGoogleLoading}
                disabled={isLoading || isGoogleLoading}
              />
            </>
          )}

          <div className="relative my-6" aria-hidden="true">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-100" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest">
              <span className="bg-white px-4 text-stone-400 font-black text-center max-w-[80%] whitespace-nowrap overflow-hidden text-ellipsis">
                {config.registerText.split('?')[0]}?
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link 
              to={`${config.registerRoute}${urlQuery}`}
              className="w-full flex items-center justify-center h-[48px] rounded-2xl font-bold text-stone-700 bg-stone-50 hover:bg-stone-100 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-stone-200"
            >
              {config.registerText.split('?')[1]?.trim() || 'Create Account'}
            </Link>
            <Link 
              to={`/auth${urlQuery}`}
              className="w-full flex items-center justify-center h-[48px] rounded-2xl font-bold text-stone-500 bg-white border-2 border-stone-100 hover:bg-stone-50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-stone-200"
            >
              Change Account Type
            </Link>
          </div>
        </>
      )}

      <AuthFooter />
    </AuthLayout>
  );
};

export default AuthLogin;
