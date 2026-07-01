import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Building2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Clock,
  XCircle,
  ChevronLeft,
  Package,
  Send,
  Leaf,
  LogIn,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { authService } from '../services/medusa/authService';
import { loginFailure, loginSuccess, authStart, authResolved } from '../redux/authSlice';
import { setUserProfile } from '../redux/userSlice';
import { mapCustomerToProfile } from '../utils/customerProfile';
import { b2bApi } from '../services/b2bApi';
import useToast from '../hooks/useToast';

const B2B_LOGIN_ACTION_TOKEN = 'b2b-login-submit';
const RATE_LIMIT_MESSAGE = 'System security delay active. Resetting connection pipeline, please wait 15 seconds.';

const getAuthErrorStatus = (error) => (
  error?.response?.status
  ?? error?.status
  ?? error?.response?.data?.status
  ?? error?.response?.data?.statusCode
);

const getLoginErrorMessage = (error) => {
  if (getAuthErrorStatus(error) === 429) {
    return RATE_LIMIT_MESSAGE;
  }

  return (
    error?.response?.data?.message
    || error?.response?.data?.error
    || error?.message
    || 'Login failed. Please check your email and password.'
  );
};

// ── Status pages ────────────────────────────────────────────────────────────

const PendingPage = ({ company, onBack }) => (
  <div className="text-center">
    <div className="inline-flex p-6 rounded-full bg-amber-500/10 text-amber-600 mb-6">
      <Clock size={48} />
    </div>
    <h2 className="text-3xl font-black mb-2">Application Pending Review</h2>
    <p className="text-text-secondary mb-6 leading-relaxed">
      Your B2B company application for <strong className="text-text-primary">{company?.company_name}</strong> has been submitted
      and is awaiting admin approval.
    </p>
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/25 rounded-2xl p-4 mb-8">
      <p className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center justify-center gap-2">
        <Clock size={18} /> Pending admin approval
      </p>
    </div>
    <Button variant="secondary" size="lg" onClick={onBack} className="gap-2">
      <ChevronLeft size={18} /> Back to Login
    </Button>
  </div>
);

const RejectedPage = ({ company, onResubmit, onBack }) => (
  <div className="text-center">
    <div className="inline-flex p-6 rounded-full bg-red-500/10 text-red-600 mb-6">
      <XCircle size={48} />
    </div>
    <h2 className="text-3xl font-black mb-2">Application Not Approved</h2>
    <p className="text-text-secondary mb-6 leading-relaxed">
      Your B2B company application for <strong className="text-text-primary">{company?.company_name}</strong> was not approved.
    </p>
    {company?.rejection_reason && (
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/25 rounded-2xl p-4 mb-6 text-left">
        <p className="text-xs font-black uppercase tracking-widest text-red-600 dark:text-red-400 mb-1">Reason</p>
        <p className="text-sm font-medium text-red-700 dark:text-red-300">{company.rejection_reason}</p>
      </div>
    )}
    <div className="flex flex-col gap-3">
      <Button size="lg" className="gap-2" onClick={onResubmit}>
        <Building2 size={18} /> Resubmit Application
      </Button>
      <Button variant="secondary" size="lg" onClick={onBack} className="gap-2">
        <ChevronLeft size={18} /> Back to Login
      </Button>
    </div>
  </div>
);

// ── Component ────────────────────────────────────────────────────────────────

const B2BLogin = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const { isAuthenticated } = useSelector((state) => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [loginActionToken, setLoginActionToken] = useState(null);

  // Post-login company check state
  const [checkingCompany, setCheckingCompany] = useState(false);
  const [company, setCompany] = useState(null);
  const [companyCheckDone, setCompanyCheckDone] = useState(false);
  const companyCheckInFlight = useRef(false);
  const submitInFlight = useRef(false);

  const checkAfterLogin = useCallback(async (actionToken) => {
    if (actionToken !== B2B_LOGIN_ACTION_TOKEN) return;
    if (companyCheckInFlight.current) return;
    companyCheckInFlight.current = true;
    setCheckingCompany(true);
    try {
      const res = await b2bApi.getCompany({ forceRefresh: true });
      const c = res?.company ?? null;
      setCompany(c);

      if (!c) {
        // No company — redirect to registration
        navigate('/b2b/register-company');
        return;
      }

      if (c.status === 'approved' || c.status === 'active') {
        navigate('/b2b/dashboard');
        return;
      }

      if (['pending', 'rejected', 'suspended'].includes(c.status)) {
        navigate(`/b2b/${c.status}`);
        return;
      }

      setCompanyCheckDone(true);
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED' || err?.message === 'canceled') return;
      setCompanyCheckDone(true);
      setFormError('Unable to check your B2B company status right now. Please try again.');
      showToast('Unable to check your B2B company status right now.', 'error');
    } finally {
      companyCheckInFlight.current = false;
      setCheckingCompany(false);
    }
  }, [navigate, showToast]);

  // Only run the post-login handshake after this component creates a real submit action token.
  useEffect(() => {
    if (
      loginActionToken === B2B_LOGIN_ACTION_TOKEN
      && isAuthenticated
      && !checkingCompany
      && !companyCheckDone
      && !companyCheckInFlight.current
    ) {
      checkAfterLogin(loginActionToken);
    }
  }, [isAuthenticated, checkingCompany, companyCheckDone, loginActionToken, checkAfterLogin]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    if (submitInFlight.current) {
      setIsSubmitting(false);
      return;
    }
    submitInFlight.current = true;
    setFormError('');
    setLoginActionToken(B2B_LOGIN_ACTION_TOKEN);

    dispatch(authStart());

    try {
      const authResponse = await authService.login(email, password);
      const profileData = await authService.getCurrentCustomer();
      const customer = profileData.customer;
      dispatch(loginSuccess({ token: authResponse?.token, user: customer }));
      dispatch(setUserProfile(mapCustomerToProfile(customer)));
      dispatch(authResolved());
      showToast('Welcome back! 🌿', 'success');

      // Check company status immediately
      await checkAfterLogin(B2B_LOGIN_ACTION_TOKEN);
    } catch (error) {
      const message = getLoginErrorMessage(error);
      setFormError(message);
      dispatch(loginFailure(message));
      dispatch(authResolved());
      showToast(message, 'error');
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const handleResubmit = () => {
    navigate('/b2b/register-company');
  };

  const handleBackToLogin = () => {
    setCompanyCheckDone(false);
    setCompany(null);
  };

  // ── Render: Checking company after login ──────────────────────────────
  if (checkingCompany) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-accent-primary" />
          <p className="text-text-secondary font-medium">Checking your B2B status...</p>
        </div>
      </div>
    );
  }

  // ── Render: Pending application ───────────────────────────────────────
  if (companyCheckDone && company && company.status === 'pending') {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white dark:bg-slate-800 rounded-[2.5rem] p-10 shadow-premium border border-stone-100 dark:border-slate-700"
        >
          <PendingPage company={company} onBack={handleBackToLogin} />
        </motion.div>
      </div>
    );
  }

  // ── Render: Rejected application ──────────────────────────────────────
  if (companyCheckDone && company && company.status === 'rejected') {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white dark:bg-slate-800 rounded-[2.5rem] p-10 shadow-premium border border-stone-100 dark:border-slate-700"
        >
          <RejectedPage company={company} onResubmit={handleResubmit} onBack={handleBackToLogin} />
        </motion.div>
      </div>
    );
  }

  // ── Render: Login form ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background blur */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-accent-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-accent-secondary/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 justify-center mb-12 group">
          <div className="bg-organic-primary p-2.5 rounded-xl text-white shadow-lg group-hover:rotate-12 transition-transform">
            <Leaf className="w-6 h-6" />
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-2xl font-black tracking-tighter text-organic-primary uppercase md:text-3xl">
              Organic <span className="text-organic-terracotta">Canada</span>
            </span>
            <span className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">B2B Portal</span>
          </div>
        </Link>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium p-8 border border-stone-100 dark:border-slate-700">
          {/* Heading */}
          <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-full bg-accent-primary/10 text-accent-primary mb-4">
              <Building2 size={28} />
            </div>
            <h1 className="text-3xl font-black mb-2">B2B Buyer Login</h1>
            <p className="text-text-secondary text-sm">
              Login to access wholesale pricing and bulk ordering.
            </p>
          </div>

          {formError && (
            <div role="alert" className="mb-5 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <Input
              label="Email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="you@company.com"
              autoComplete="email"
              disabled={isSubmitting}
              required
            />

            <Input
              label="Password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={isSubmitting}
              required
            />

            <Button
              type="submit"
              size="lg"
              className="gap-2"
              isLoading={isSubmitting}
            >
              <LogIn size={18} />
              {isSubmitting ? 'Signing in...' : 'Sign In'}
              {!isSubmitting && <ArrowRight size={18} />}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-100 dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-slate-800 px-4 text-text-secondary font-bold">
                New customer?
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="gap-2"
              onClick={() => navigate('/b2b/register-company')}
            >
              <Building2 size={18} /> Register Your Company
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              onClick={() => navigate('/login')}
            >
              <ArrowLeft size={18} /> Standard Customer Login
            </Button>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[
            { icon: <Package size={16} />, label: 'Wholesale Pricing' },
            { icon: <Send size={16} />, label: 'Quote Requests' },
            { icon: <ShieldCheck size={16} />, label: 'Credit Terms' },
          ].map((b, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-3 shadow-sm border border-stone-100 dark:border-slate-700 text-center">
              <div className="text-accent-primary mb-1 flex justify-center">{b.icon}</div>
              <p className="text-[10px] font-bold text-text-secondary">{b.label}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-secondary hover:text-accent-primary mx-auto transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Store
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default B2BLogin;
