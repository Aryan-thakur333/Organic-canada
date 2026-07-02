import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  User, 
  MapPin, 
  CreditCard, 
  Settings, 
  LogOut, 
  Camera,
  ChevronRight,
  ShieldCheck,
  Mail,
  Phone,
  Repeat,
  Sparkles,
  Loader2,
  Download,
  Building2,
  ClipboardList
} from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { logout } from '../redux/authSlice';
import { clearUserProfile, setUserProfile } from '../redux/userSlice';
import { mapCustomerToProfile } from '../utils/customerProfile';
import { authService } from '../services/medusa/authService';
import { subscriptionService } from '../services/medusa/subscriptionService';
import useToast from '../hooks/useToast';
import B2BSidebarCard from '../components/B2BSidebarCard';
import useB2BCompany from '../hooks/useB2BCompany';
import { isB2BUser } from '../utils/accountType';

const Profile = () => {
  const user = useSelector(state => state.user.profile);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { company: b2bCompany } = useB2BCompany();
  const isApprovedB2B = isB2BUser(user, b2bCompany);
  
  const [formData, setFormData] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    company_name: user?.company_name || '',
  });

  // ── Subscription State ──
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);
  const [subLoading, setSubLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const latestSub = activeSubscriptions.find((item) => ['active', 'trialing'].includes(item.status)) || null;
  const isSubscribed = !!latestSub && ['active', 'trialing'].includes(latestSub.status);

  const fetchSubscriptions = useCallback(async () => {
    setSubLoading(true);
    try {
      const res = await subscriptionService.list();
      setActiveSubscriptions(res.subscriptions || []);
    } catch {
      // silently fail — subscription data is non-critical for profile render
    } finally {
      setSubLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isApprovedB2B) {
      fetchSubscriptions();
    } else {
      setSubLoading(false);
      setActiveSubscriptions([]);
    }
  }, [fetchSubscriptions, isApprovedB2B]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    authService.getCurrentCustomer({ signal: controller.signal }).then(({ customer }) => {
      if (!active) return;
      const profile = mapCustomerToProfile(customer);
      dispatch(setUserProfile(profile));
      setFormData({ first_name: profile.first_name, last_name: profile.last_name, email: profile.email, phone: profile.phone, company_name: profile.company_name });
    }).catch((error) => {
      const isCanceled = error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || error?.message === 'canceled';
      if (!active || isCanceled) return;
      if (error?.status === 401 || error?.response?.status === 401) {
        dispatch(logout());
        dispatch(clearUserProfile());
        navigate('/login');
      } else showToast(error?.message || 'Unable to load profile', 'error');
    }).finally(() => active && setProfileLoading(false));
    return () => {
      active = false;
      controller.abort();
    };
  }, [dispatch, navigate, showToast]);

  const handleLogout = async () => {
    try {
      await authService.logout();
      dispatch(logout());
      dispatch(clearUserProfile());
      showToast("Logged out successfully", "success");
      navigate('/login');
    } catch (error) {
      showToast("Logout failed", "error");
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      const { customer } = await authService.updateCustomer(formData);
      const profile = mapCustomerToProfile(customer);
      dispatch(setUserProfile(profile));
      setFormData({ first_name: profile.first_name, last_name: profile.last_name, email: profile.email, phone: profile.phone, company_name: profile.company_name });
      showToast("Profile updated", "success");
    } catch (error) {
      showToast("Update failed", "error");
    }
  };

  const defaultAddress = user?.addresses?.find((address) => address.is_default_shipping) || user?.addresses?.[0];

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Sidebar */}
          <aside className="lg:w-80 flex flex-col gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700 text-center">
              <div className="relative inline-block mb-6">
                <div className="w-24 h-24 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary text-3xl font-black">
                  {user?.email?.[0].toUpperCase() || 'U'}
                </div>
                <button className="absolute bottom-0 right-0 p-2 bg-white dark:bg-slate-700 rounded-full shadow-lg text-text-primary border border-stone-100 dark:border-slate-600">
                  <Camera size={16} />
                </button>
              </div>
              <h2 className="text-xl font-black mb-1">{user?.first_name} {user?.last_name}</h2>
              <p className="text-sm text-text-secondary font-medium mb-6">{user?.email}</p>
              <div className="h-px bg-stone-100 dark:bg-slate-700 mb-6" />
              <div className="flex flex-col gap-2">
                <button className="flex items-center justify-between p-3 rounded-2xl bg-accent-primary/5 text-accent-primary text-sm font-bold">
                  <span className="flex items-center gap-3"><Settings size={18} /> Settings</span>
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => navigate('/my-downloads')}
                  className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-secondary text-sm font-bold transition-colors"
                >
                  <span className="flex items-center gap-3"><Download size={18} /> My Downloads</span>
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => navigate('/addresses')}
                  className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-secondary text-sm font-bold transition-colors"
                >
                  <span className="flex items-center gap-3"><MapPin size={18} /> Addresses</span>
                  <ChevronRight size={16} />
                </button>
                <button className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-secondary text-sm font-bold transition-colors">
                  <span className="flex items-center gap-3"><CreditCard size={18} /> Payments</span>
                  <ChevronRight size={16} />
                </button>
                {!isApprovedB2B && (
                  <button
                    onClick={() => navigate('/dashboard/subscriptions')}
                    className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-secondary text-sm font-bold transition-colors"
                  >
                    <span className="flex items-center gap-3"><Repeat size={18} /> My Subscriptions</span>
                    <ChevronRight size={16} />
                  </button>
                )}
                {isApprovedB2B && (
                  <>
                    <button
                      onClick={() => navigate('/b2b/dashboard')}
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-secondary text-sm font-bold transition-colors"
                    >
                      <span className="flex items-center gap-3"><Building2 size={18} /> B2B Dashboard</span>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() => navigate('/b2b/products')}
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-secondary text-sm font-bold transition-colors"
                    >
                      <span className="flex items-center gap-3"><Building2 size={18} /> Wholesale Products</span>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() => navigate('/account/b2b-quotes')}
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-secondary text-sm font-bold transition-colors"
                    >
                      <span className="flex items-center gap-3"><ClipboardList size={18} /> B2B Quotes</span>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() => navigate('/orders')}
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-secondary text-sm font-bold transition-colors"
                    >
                      <span className="flex items-center gap-3"><ClipboardList size={18} /> My Orders</span>
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}
                <button 
                  onClick={handleLogout}
                  className="flex items-center justify-between p-3 rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 text-sm font-bold transition-colors"
                >
                  <span className="flex items-center gap-3"><LogOut size={18} /> Sign Out</span>
                </button>
              </div>
            </div>

            {/* Subscription Card */}
            {!isApprovedB2B && (
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 shadow-premium border border-stone-100 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/20">
                  <Sparkles size={16} />
                </div>
                <h4 className="text-sm font-black uppercase tracking-widest">
                  {isSubscribed ? 'Current Plan' : 'Subscription'}
                </h4>
                {subLoading ? (
                  <Loader2 size={14} className="ml-auto animate-spin text-text-secondary" />
                ) : isSubscribed ? (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-[9px] font-black uppercase tracking-wider border border-green-200 dark:border-green-800/25">
                    {latestSub.status}
                  </span>
                ) : null}
              </div>

              {subLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-6 w-24 bg-stone-200 dark:bg-slate-700 rounded" />
                  <div className="h-4 w-32 bg-stone-100 dark:bg-slate-800 rounded" />
                </div>
              ) : isSubscribed ? (
                <>
                  <p className="text-xl font-black text-text-primary mb-1">
                    {latestSub.product_title || 'Premium Plan'}
                  </p>
                  <p className="text-xs text-text-secondary font-medium mb-4">
                    ${(latestSub.amount / 100).toFixed(2)} / {latestSub.plan}
                    {latestSub.next_billing_date && (
                      <> — renews {new Date(latestSub.next_billing_date).toLocaleDateString()}</>
                    )}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full gap-2 text-xs font-black uppercase tracking-wider"
                    onClick={() => navigate('/dashboard/subscriptions')}
                  >
                    <Settings size={14} /> Manage Plan
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xl font-black text-text-primary mb-1">Free Plan</p>
                  <p className="text-xs text-text-secondary font-medium mb-4">
                    Upgrade to unlock recurring deliveries &amp; exclusive discounts.
                  </p>
                  <Button
                    size="sm"
                    className="w-full gap-2 text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-400"
                    onClick={() => navigate('/dashboard/subscriptions')}
                  >
                    <><Sparkles size={14} /> View Plans</>
                  </Button>
                </>
              )}
            </div>
            )}

            {isApprovedB2B && <B2BSidebarCard navigate={navigate} />}

            <div className="bg-bg-secondary p-6 rounded-[2rem] border border-stone-100 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-4">
                <ShieldCheck className="text-accent-primary" size={20} />
                <h4 className="text-sm font-black uppercase tracking-widest">Security</h4>
              </div>
              <p className="text-xs text-text-secondary font-medium leading-relaxed">
                Your account is protected with industry-standard encryption and security protocols.
              </p>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 flex flex-col gap-8">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-10 shadow-premium border border-stone-100 dark:border-slate-700"
            >
              <h2 className="text-3xl font-black mb-8">Personal Information</h2>
              <form onSubmit={handleUpdateProfile} className="grid md:grid-cols-2 gap-8">
                <Input 
                  label="First Name" 
                  name="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  placeholder="First name" 
                />
                <Input 
                  label="Last Name" 
                  name="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                  placeholder="Last name" 
                />
                <div className="relative">
                  <Mail className="absolute right-4 top-[2.4rem] text-stone-300" size={18} />
                  <Input 
                    label="Email Address" 
                    name="email"
                    type="email"
                    value={formData.email}
                    readOnly
                    placeholder="Email address" 
                    className="opacity-70"
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute right-4 top-[2.4rem] text-stone-300" size={18} />
                  <Input 
                    label="Phone Number" 
                    name="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="Phone number" 
                  />
                </div>
                <Input
                  label="Company (optional)"
                  name="company_name"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  placeholder="Company name"
                />
                <div className="flex flex-col justify-end pb-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">Member since</span>
                  <span className="text-sm font-bold mt-2">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Not available'}</span>
                </div>
                
                <div className="md:col-span-2 pt-4 flex justify-end">
                  <Button type="submit" size="lg" className="px-12" disabled={profileLoading}>
                    {profileLoading ? 'Loading…' : 'Update Profile'}
                  </Button>
                </div>
              </form>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-sm border border-stone-100 dark:border-slate-700">
                <h3 className="text-xl font-black mb-4">Saved Address</h3>
                <p className="text-sm text-text-secondary mb-6 leading-relaxed">
                  {defaultAddress ? <>{defaultAddress.address_1}{defaultAddress.address_2 ? `, ${defaultAddress.address_2}` : ''}<br />{[defaultAddress.city, defaultAddress.province, defaultAddress.postal_code, defaultAddress.country_code?.toUpperCase()].filter(Boolean).join(', ')}</> : 'No saved address.'}
                </p>
                <Button variant="secondary" size="sm" onClick={() => navigate('/addresses')}>Manage Addresses</Button>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-sm border border-stone-100 dark:border-slate-700">
                <h3 className="text-xl font-black mb-4">Payment Method</h3>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-slate-700 flex items-center justify-center">
                    <CreditCard size={20} />
                  </div>
                  <p className="text-sm font-bold">No saved payment method</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => showToast('Saved payment methods are not enabled yet.', 'info')}>Manage Payments</Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default Profile;
