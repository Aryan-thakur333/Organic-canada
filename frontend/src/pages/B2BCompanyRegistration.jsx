import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ArrowRight,
  CreditCard,
  Hash,
  FileText,
  ShieldCheck,
  Sparkles,
  Package,
  Send,
  Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import { b2bApi } from '../services/b2bApi';
import { authService } from '../services/medusa/authService';
import { authResolved, authStart, loginSuccess } from '../redux/authSlice';
import { setUserProfile } from '../redux/userSlice';
import { mapCustomerToProfile } from '../utils/customerProfile';
import useToast from '../hooks/useToast';

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtPrice = (cents) => `$${(cents / 100).toFixed(2)}`;

// ── Component ──────────────────────────────────────────────────────────────

const B2BCompanyRegistration = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const { isAuthenticated, authResolved: isAuthResolved } = useSelector((state) => state.auth);

  // ── State ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingCompany, setExistingCompany] = useState(null);
  const [success, setSuccess] = useState(false);

  // ── Form fields ───────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [creditLimit, setCreditLimit] = useState('');

  // ── Errors ────────────────────────────────────────────────────────────
  const [fieldErrors, setFieldErrors] = useState({});

  // ── Check for existing company on mount ───────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      if (!isAuthResolved) return;
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }

      try {
        const res = await b2bApi.getCompany({ signal: controller.signal });
        if (controller.signal.aborted) return;
        if (res?.company) {
          setExistingCompany(res.company);
          setCompanyName(res.company.company_name || '');
          setTaxId(res.company.tax_id || '');
          setCreditLimit(res.company.requested_credit_limit ? String(res.company.requested_credit_limit / 100) : '');
        }
      } catch (err) {
        const isCanceled = err?.name === 'AbortError' || err?.code === 'ERR_CANCELED' || err?.message === 'canceled';
        if (!isCanceled && err?.response?.status !== 401 && err?.response?.status !== 404) {
          showToast('Unable to load B2B application status. Please try again.', 'error');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [isAuthenticated, isAuthResolved, showToast]);

  // ── Validation ────────────────────────────────────────────────────────
  const validate = () => {
    const errors = {};

    if (!isAuthenticated) {
      const trimmedEmail = email.trim();
      if (!firstName.trim()) errors.firstName = 'First name is required';
      if (!lastName.trim()) errors.lastName = 'Last name is required';
      if (!trimmedEmail) {
        errors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        errors.email = 'Enter a valid email address';
      }
      if (!password) {
        errors.password = 'Password is required';
      } else if (password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
      }
      if (confirmPassword !== password) {
        errors.confirmPassword = 'Passwords must match';
      }
    }

    if (!companyName.trim()) {
      errors.companyName = 'Company name is required';
    } else if (companyName.trim().length < 2) {
      errors.companyName = 'Company name must be at least 2 characters';
    }

    if (taxId.trim() && !/^[A-Za-z0-9-]+$/.test(taxId.trim())) {
      errors.taxId = 'Tax ID can only contain letters, numbers, and hyphens';
    }

    if (creditLimit.trim()) {
      const val = parseFloat(creditLimit);
      if (isNaN(val) || val < 0) {
        errors.creditLimit = 'Credit limit must be a non-negative number';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (!isAuthenticated) {
        dispatch(authStart());
        const { token, customer } = await authService.register({
          email,
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
        });
        dispatch(loginSuccess({ token, user: customer }));
        dispatch(setUserProfile(mapCustomerToProfile(customer)));
        dispatch(authResolved());
      }

      const payload = {
        company_name: companyName.trim(),
      };
      if (taxId.trim()) payload.tax_id = taxId.trim();
      if (creditLimit.trim()) payload.requested_credit_limit = parseFloat(creditLimit);

      const res = await b2bApi.registerCompany(payload);
      setExistingCompany(res?.company ?? null);
      setSuccess(true);
      showToast('Application submitted successfully.', 'success');
      navigate('/b2b/pending');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Registration failed';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render: Loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-40 pb-20 container-custom flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={40} className="animate-spin text-accent-primary" />
            <p className="text-text-secondary font-medium">Checking your company status...</p>
          </div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // ── Render: Already registered ────────────────────────────────────────
  if (existingCompany && !success) {
    const status = existingCompany.status;
    const isApproved = status === 'approved' || status === 'active';
    const isPending = status === 'pending';
    const isRejected = status === 'rejected';

    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-32 pb-20 container-custom">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-xl mx-auto bg-white dark:bg-slate-800 rounded-[2.5rem] p-12 shadow-premium border border-stone-100 dark:border-slate-700 text-center"
          >
            <div className={`inline-flex p-6 rounded-full mb-6 ${
              isApproved
                ? 'bg-emerald-500/10 text-emerald-500'
                : isPending
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'bg-red-500/10 text-red-500'
            }`}>
              <Building2 size={48} />
            </div>

            {isApproved && (
              <>
                <h2 className="text-3xl font-black mb-2">B2B Wholesale Active 🎉</h2>
                <p className="text-text-secondary mb-6 leading-relaxed">
                  Your company is approved! You have access to wholesale pricing and can
                  submit bulk quote requests.
                </p>
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/25 rounded-2xl p-4 mb-8">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-2">
                    <CheckCircle2 size={18} /> Wholesale pricing active
                  </p>
                </div>
              </>
            )}

            {isPending && (
              <>
                <h2 className="text-3xl font-black mb-2">Application Pending Review</h2>
                <p className="text-text-secondary mb-8 leading-relaxed">
                  Your B2B company application has been submitted and is awaiting
                  admin approval. You'll be notified once your account is activated.
                </p>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/25 rounded-2xl p-4 mb-8">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center justify-center gap-2">
                    <Clock size={18} /> Pending admin approval
                  </p>
                </div>
              </>
            )}

            {isRejected && (
              <>
                <h2 className="text-3xl font-black mb-2">Application Not Approved</h2>
                <p className="text-text-secondary mb-6 leading-relaxed">
                  Your B2B company application was not approved at this time.
                </p>
                {existingCompany.rejection_reason && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/25 rounded-2xl p-4 mb-4">
                    <p className="text-xs font-black uppercase tracking-widest text-red-600 dark:text-red-400 mb-1">Reason</p>
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{existingCompany.rejection_reason}</p>
                  </div>
                )}
                <div className="mb-8">
                  <Button
                    variant="secondary"
                    size="lg"
                    className="gap-2"
                    onClick={() => { setExistingCompany(null); setSuccess(false); }}
                  >
                    <Building2 size={18} /> Resubmit Application
                  </Button>
                </div>
              </>
            )}

            <div className="bg-stone-50 dark:bg-slate-900/50 rounded-2xl p-6 mb-8 text-left text-sm space-y-3">
              <div className="flex justify-between">
                <span className="text-text-secondary font-medium">Company</span>
                <span className="font-bold text-text-primary">{existingCompany.company_name}</span>
              </div>
              {existingCompany.tax_id && (
                <div className="flex justify-between">
                  <span className="text-text-secondary font-medium">Tax ID</span>
                  <span className="font-bold text-text-primary">{existingCompany.tax_id}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-secondary font-medium">Credit Limit</span>
                <span className="font-bold text-text-primary">{fmtPrice(existingCompany.approved_credit_limit || existingCompany.credit_limit || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary font-medium">Status</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                  isApproved
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/25'
                    : isPending
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/25'
                      : 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-200 dark:border-red-800/25'
                }`}>
                  {existingCompany.status}
                </span>
              </div>
              {existingCompany.admin_note && (
                <div className="pt-2 border-t border-stone-200 dark:border-slate-700">
                  <span className="text-text-secondary font-medium block text-xs">Admin Note</span>
                  <span className="font-medium text-text-primary text-xs italic">{existingCompany.admin_note}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {isApproved && (
                <>
                  <Button size="lg" className="gap-2" onClick={() => navigate('/b2b/request-quote')}>
                    <Send size={18} /> New Quote
                  </Button>
                  <Button variant="secondary" size="lg" className="gap-2" onClick={() => navigate('/account/b2b-quotes')}>
                    <FileText size={18} /> Quote History
                  </Button>
                </>
              )}
              {isPending && (
                <Button variant="secondary" size="lg" className="gap-2" onClick={() => navigate('/profile')}>
                  <ChevronLeft size={18} /> Back to Profile
                </Button>
              )}
            </div>
          </motion.div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // ── Render: Success ───────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-32 pb-20 container-custom">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-xl mx-auto bg-white dark:bg-slate-800 rounded-[2.5rem] p-12 shadow-premium border border-stone-100 dark:border-slate-700 text-center"
          >
            <div className="inline-flex p-6 rounded-full bg-green-500/10 text-green-500 mb-6">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="text-3xl font-black mb-2">Welcome to B2B Wholesale! 🎉</h2>
            <p className="text-text-secondary mb-8 leading-relaxed">
              <strong className="text-text-primary">{companyName}</strong> has been registered
              successfully. Your account is pending admin approval — you'll be able to
              submit wholesale quote requests once activated.
            </p>

            <div className="grid sm:grid-cols-3 gap-4 mb-10">
              <div className="p-4 bg-stone-50 dark:bg-slate-900/50 rounded-2xl text-xs text-left">
                <div className="w-8 h-8 rounded-lg bg-accent-primary/10 text-accent-primary flex items-center justify-center mb-2">
                  <Building2 size={16} />
                </div>
                <p className="font-black text-text-primary">{companyName}</p>
                <p className="text-text-secondary font-medium">Company</p>
              </div>
              <div className="p-4 bg-stone-50 dark:bg-slate-900/50 rounded-2xl text-xs text-left">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center mb-2">
                  <ShieldCheck size={16} />
                </div>
                <p className="font-black text-text-primary capitalize">Pending Review</p>
                <p className="text-text-secondary font-medium">Status</p>
              </div>
              <div className="p-4 bg-stone-50 dark:bg-slate-900/50 rounded-2xl text-xs text-left">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center mb-2">
                  <Sparkles size={16} />
                </div>
                <p className="font-black text-text-primary">Quote Ready</p>
                <p className="text-text-secondary font-medium">Next Step</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                className="gap-2"
                onClick={() => navigate('/account/b2b-quotes')}
              >
                <ArrowRight size={18} /> Go to Dashboard
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate('/profile')}
              >
                Back to Profile
              </Button>
            </div>
          </motion.div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // ── Render: Registration form ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />

      <main className="pt-32 pb-20 container-custom">
        <div className="max-w-2xl mx-auto">
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-4 mb-10">
            <button
              onClick={() => navigate('/profile')}
              className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-4xl font-black text-text-primary">B2B Company Registration.</h1>
              <p className="text-sm text-text-secondary">
                Register your business to access wholesale pricing, bulk ordering, and dedicated account management.
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-5 gap-8 items-start">
            {/* ── Form ──────────────────────────────────────────────────── */}
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleSubmit}
              className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700"
            >
              <h2 className="text-2xl font-black text-text-primary mb-8 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                  <Building2 size={20} />
                </div>
                Create your B2B buyer account
              </h2>

              {!isAuthenticated ? (
                <div className="mb-8 grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                      First Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        if (fieldErrors.firstName) setFieldErrors((prev) => ({ ...prev, firstName: '' }));
                      }}
                      className={`w-full px-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                        fieldErrors.firstName ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-transparent focus:border-accent-primary'
                      }`}
                    />
                    {fieldErrors.firstName && <p className="mt-1.5 text-xs font-medium text-red-500">{fieldErrors.firstName}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                      Last Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        if (fieldErrors.lastName) setFieldErrors((prev) => ({ ...prev, lastName: '' }));
                      }}
                      className={`w-full px-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                        fieldErrors.lastName ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-transparent focus:border-accent-primary'
                      }`}
                    />
                    {fieldErrors.lastName && <p className="mt-1.5 text-xs font-medium text-red-500">{fieldErrors.lastName}</p>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                      Email <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
                      }}
                      placeholder="buyer@company.com"
                      className={`w-full px-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                        fieldErrors.email ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-transparent focus:border-accent-primary'
                      }`}
                    />
                    {fieldErrors.email && <p className="mt-1.5 text-xs font-medium text-red-500">{fieldErrors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                      Password <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
                      }}
                      placeholder="Minimum 8 characters"
                      className={`w-full px-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                        fieldErrors.password ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-transparent focus:border-accent-primary'
                      }`}
                    />
                    {fieldErrors.password && <p className="mt-1.5 text-xs font-medium text-red-500">{fieldErrors.password}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                      Confirm Password <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
                      }}
                      className={`w-full px-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                        fieldErrors.confirmPassword ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-transparent focus:border-accent-primary'
                      }`}
                    />
                    {fieldErrors.confirmPassword && <p className="mt-1.5 text-xs font-medium text-red-500">{fieldErrors.confirmPassword}</p>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                      Phone <span className="text-stone-400 font-normal normal-case">- optional</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-2xl text-sm font-semibold outline-none transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:border-emerald-800/25 dark:bg-emerald-950/20 dark:text-emerald-300">
                  You are signed in. This B2B application will be linked to your current customer account.
                </div>
              )}

              <h3 className="text-xl font-black text-text-primary mb-6 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                  <Building2 size={18} />
                </div>
                Company Details
              </h3>

              {/* Company Name */}
              <div className="mb-6">
                <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                  Company Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    if (fieldErrors.companyName) setFieldErrors((prev) => ({ ...prev, companyName: '' }));
                  }}
                  placeholder="e.g. Greenfield Organics Inc."
                  className={`w-full px-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                    fieldErrors.companyName
                      ? 'border-red-300 dark:border-red-700 focus:border-red-500'
                      : 'border-transparent focus:border-accent-primary'
                  }`}
                  autoFocus
                />
                {fieldErrors.companyName && (
                  <p className="mt-1.5 text-xs font-medium text-red-500 flex items-center gap-1">
                    <AlertCircle size={12} /> {fieldErrors.companyName}
                  </p>
                )}
              </div>

              {/* Tax ID */}
              <div className="mb-6">
                <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                  Tax ID / VAT Number <span className="text-stone-400 font-normal normal-case">— optional</span>
                </label>
                <div className="relative">
                  <Hash size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => {
                      setTaxId(e.target.value);
                      if (fieldErrors.taxId) setFieldErrors((prev) => ({ ...prev, taxId: '' }));
                    }}
                    placeholder="e.g. 12-3456789 or VAT-GB123456789"
                    className={`w-full pl-10 pr-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                      fieldErrors.taxId
                        ? 'border-red-300 dark:border-red-700 focus:border-red-500'
                        : 'border-transparent focus:border-accent-primary'
                    }`}
                  />
                </div>
                {fieldErrors.taxId && (
                  <p className="mt-1.5 text-xs font-medium text-red-500 flex items-center gap-1">
                    <AlertCircle size={12} /> {fieldErrors.taxId}
                  </p>
                )}
                <p className="mt-1.5 text-[11px] text-text-secondary font-medium">
                  Used for invoicing and tax exemption verification.
                </p>
              </div>

              {/* Credit Limit Request */}
              <div className="mb-8">
                <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                  Requested Credit Limit <span className="text-stone-400 font-normal normal-case">— optional</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-sm">$</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={creditLimit}
                    onChange={(e) => {
                      setCreditLimit(e.target.value);
                      if (fieldErrors.creditLimit) setFieldErrors((prev) => ({ ...prev, creditLimit: '' }));
                    }}
                    placeholder="e.g. 5000"
                    className={`w-full pl-8 pr-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                      fieldErrors.creditLimit
                        ? 'border-red-300 dark:border-red-700 focus:border-red-500'
                        : 'border-transparent focus:border-accent-primary'
                    }`}
                  />
                </div>
                {fieldErrors.creditLimit && (
                  <p className="mt-1.5 text-xs font-medium text-red-500 flex items-center gap-1">
                    <AlertCircle size={12} /> {fieldErrors.creditLimit}
                  </p>
                )}
                <p className="mt-1.5 text-[11px] text-text-secondary font-medium">
                  Your initial credit limit in USD. Subject to admin review and approval.
                </p>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                size="lg"
                className="w-full gap-2 text-sm font-black uppercase tracking-wider"
                disabled={submitting}
                isLoading={submitting}
              >
                <Building2 size={18} />
                {submitting ? 'Creating account...' : isAuthenticated ? 'Register Company' : 'Create Account & Register Company'}
              </Button>
            </motion.form>

            {/* ── Sidebar: Benefits ─────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-2 space-y-4"
            >
              <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 shadow-premium border border-stone-100 dark:border-slate-700">
                <h3 className="text-sm font-black uppercase tracking-widest mb-5 flex items-center gap-2">
                  <Sparkles size={16} className="text-accent-primary" />
                  Wholesale Benefits
                </h3>
                <div className="space-y-4">
                  {[
                    { icon: <Package size={18} />, title: 'Bulk Pricing', desc: 'Access volume discounts on wholesale orders.' },
                    { icon: <Send size={18} />, title: 'Quote Requests', desc: 'Submit custom bulk orders for admin review and negotiation.' },
                    { icon: <CreditCard size={18} />, title: 'Credit Terms', desc: 'Get approved for corporate credit limits and net terms.' },
                    { icon: <ShieldCheck size={18} />, title: 'Dedicated Support', desc: 'Priority support and account management for B2B customers.' },
                  ].map((benefit, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                        {benefit.icon}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-text-primary">{benefit.title}</p>
                        <p className="text-[11px] text-text-secondary font-medium leading-relaxed">{benefit.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/25 rounded-[2rem] p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-amber-800 dark:text-amber-300 mb-1">
                      Admin Approval Required
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                      Registration is subject to review by our team. You'll be notified
                      once your company account is activated.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default B2BCompanyRegistration;
