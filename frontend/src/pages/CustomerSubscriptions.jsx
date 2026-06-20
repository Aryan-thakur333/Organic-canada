import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { updateUserProfile } from '../redux/userSlice';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  CreditCard, 
  Pause, 
  Play, 
  Trash2, 
  ChevronLeft, 
  RefreshCw, 
  AlertCircle,
  HelpCircle,
  Receipt,
  CheckCircle2,
  Clock,
  Sparkles,
  X
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import { subscriptionService } from '../services/medusa/subscriptionService';
import { orderService } from '../services/medusa/orderService';
import useToast from '../hooks/useToast';
import InvoiceModal from '../components/common/InvoiceModal';

const CustomerSubscriptions = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useDispatch();
  const userProfile = useSelector((state) => state.user?.profile);
  const { showToast } = useToast();
  
  const [subscriptions, setSubscriptions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // ── Stripe session verification on redirect ──────────────────────────
  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    const canceled = searchParams.get('canceled')

    if (canceled === 'true') {
      showToast('Upgrade was canceled. You can try again anytime.', 'info')
      setSearchParams({}, { replace: true })
      fetchData()
      return
    }

    if (!sessionId) return

    const verifySession = async () => {
      setVerifying(true)
      setVerifyResult({ success: false, message: 'Verifying payment…' })

      try {
        const res = await subscriptionService.verifySession(sessionId)

        if (res?.success) {
          setVerifyResult({ success: true, message: 'Premium membership activated! 🎉' })
          showToast('Premium membership activated! Enjoy fast delivery & perks.', 'success')

          if (res?.customer?.metadata) {
            dispatch(updateUserProfile({
              metadata: {
                ...(userProfile?.metadata || {}),
                ...res.customer.metadata,
              },
            }))
          }

          await fetchData()
        } else {
          setVerifyResult({ success: false, message: res?.message || 'Verification failed.' })
          showToast(res?.message || 'Payment verification failed', 'error')
        }
      } catch (err) {
        const msg = err?.response?.data?.message || err?.message || 'Failed to verify payment'
        setVerifyResult({ success: false, message: msg })
        showToast(msg, 'error')
      } finally {
        setVerifying(false)
        setSearchParams({}, { replace: true })
      }
    }

    verifySession()
  }, [])

  // ── Data fetching (skip if session verification already loaded data) ──
  const fetchData = async () => {
    setLoading(true);
    try {
      const [subsRes, ordersRes] = await Promise.all([
        subscriptionService.list(),
        orderService.listOrders()
      ]);
      setSubscriptions(subsRes.subscriptions || []);
      setOrders(ordersRes.orders || []);
    } catch (error) {
      showToast("Failed to retrieve subscription data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchParams.get('session_id') && !searchParams.get('canceled')) {
      fetchData();
    }
  }, []);

  const handleAction = async (id, action) => {
    setActionLoading(id);
    setConfirmModal(null);
    try {
      let updatedSub;
      if (action === 'pause') {
        const res = await subscriptionService.pause(id);
        updatedSub = res.subscription;
        showToast("Subscription paused successfully", "success");
      } else if (action === 'resume') {
        const res = await subscriptionService.resume(id);
        updatedSub = res.subscription;
        showToast("Subscription resumed successfully", "success");
      } else if (action === 'cancel') {
        const res = await subscriptionService.cancel(id);
        updatedSub = res.subscription;
        showToast("Subscription cancelled", "success");
      }

      if (updatedSub) {
        setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, ...updatedSub } : s));
      }
    } catch (error) {
      showToast(`Failed to ${action} subscription`, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 border border-green-200 dark:border-green-800/25';
      case 'trialing':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/25';
      case 'paused':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/25';
      case 'past_due':
        return 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800/25 animate-pulse';
      case 'cancelled':
      case 'expired':
      default:
        return 'bg-stone-100 text-stone-600 dark:bg-slate-800 dark:text-slate-400 border border-stone-200 dark:border-slate-700';
    }
  };

  // Filter orders related to a subscription
  const getSubBillingHistory = (subId) => {
    return orders.filter(order => 
      order.metadata?.subscription_id === subId || 
      order.items?.some((item) => item.metadata?.subscription_id === subId)
    );
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        {/* Session Verification Banner */}
        {verifyResult && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`mb-8 p-6 rounded-[2rem] border-2 flex items-center gap-4 ${
              verifyResult.success
                ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/30'
                : verifying
                  ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/30'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/30'
            }`}
          >
            {verifying ? (
              <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-500 animate-spin shrink-0" />
            ) : verifyResult.success ? (
              <CheckCircle2 size={32} className="text-green-500 shrink-0" />
            ) : (
              <AlertCircle size={32} className="text-red-500 shrink-0" />
            )}
            <div className="flex-1">
              <p className={`font-black text-lg ${
                verifyResult.success
                  ? 'text-green-800 dark:text-green-200'
                  : verifying
                    ? 'text-blue-800 dark:text-blue-200'
                    : 'text-red-800 dark:text-red-200'
              }`}>
                {verifyResult.message}
              </p>
              {verifyResult.success && (
                <p className="text-sm font-medium text-green-700 dark:text-green-300 mt-1">
                  ✨ Fast Delivery and all Premium perks are now active on your account.
                </p>
              )}
            </div>
            <button
              onClick={() => setVerifyResult(null)}
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
            >
              <X size={20} className={verifyResult.success ? 'text-green-600' : 'text-red-600'} />
            </button>
          </motion.div>
        )}

        <div className="flex items-center gap-4 mb-10">
          <button 
            onClick={() => navigate('/profile')} 
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-4xl font-black text-text-primary">Subscriptions.</h1>
            <p className="text-sm text-text-secondary">Manage your active crop schedules, membership tiers, and automated renewals.</p>
          </div>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-8">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-96 bg-white dark:bg-slate-800 rounded-[2.5rem] border border-stone-100 dark:border-slate-750 animate-pulse" />
            ))}
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="py-24 text-center max-w-xl mx-auto bg-white dark:bg-slate-800 p-12 rounded-[2.5rem] border border-stone-100 dark:border-slate-700 shadow-premium">
            <div className="inline-flex p-8 rounded-full bg-green-500/10 text-green-600 mb-8">
              <Calendar size={64} />
            </div>
            <h2 className="text-3xl font-black mb-4">No active subscriptions</h2>
            <p className="text-text-secondary mb-10 leading-relaxed">Subscribe to a Weekly/Monthly Organic Box to get freshly harvested fruits & veggies delivered to your doorstep automatically.</p>
            <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate('/listing')}>
              Explore Weekly Organic Boxes
            </Button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {subscriptions.map((sub, i) => {
              const billingHistory = getSubBillingHistory(sub.id);
              const isUpdating = actionLoading === sub.id;
              
              return (
                <motion.div
                  key={sub.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-[2.5rem] p-8 shadow-premium overflow-hidden relative"
                >
                  <div className="flex justify-between items-start mb-6 gap-4">
                    <div>
                      <h3 className="text-2xl font-black text-text-primary mb-1">{sub.product_title || 'Organic Subscription'}</h3>
                      <p className="text-xs text-text-secondary font-medium">Subscription ID: #{sub.id.slice(-8).toUpperCase()}</p>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${getStatusStyle(sub.status)}`}>
                      {sub.status}
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6 p-6 bg-stone-50 dark:bg-slate-900/50 rounded-3xl mb-6 text-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                        <Sparkles size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] text-text-secondary font-black uppercase tracking-wider">Plan frequency</p>
                        <p className="font-bold text-text-primary uppercase">{sub.plan}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                        <CreditCard size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] text-text-secondary font-black uppercase tracking-wider">Amount</p>
                        <p className="font-bold text-text-primary">${(sub.amount / 100).toFixed(2)} / {sub.plan === 'weekly' ? 'week' : 'month'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                        <Calendar size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] text-text-secondary font-black uppercase tracking-wider">Next Renewal</p>
                        <p className="font-bold text-text-primary">
                          {sub.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                        <Clock size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] text-text-secondary font-black uppercase tracking-wider">Started on</p>
                        <p className="font-bold text-text-primary">
                          {new Date(sub.created_at || sub.next_billing_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions Section */}
                  {sub.status !== 'cancelled' && sub.status !== 'expired' && (
                    <div className="flex gap-4 justify-between items-center mb-8 border-b border-stone-100 dark:border-slate-700/50 pb-6">
                      <div className="flex gap-2 w-full">
                        {sub.status === 'active' ? (
                          <Button
                            variant="secondary"
                            className="flex-1 gap-2 text-xs font-black uppercase tracking-wider"
                            onClick={() => setConfirmModal({ id: sub.id, action: 'pause' })}
                            disabled={isUpdating}
                          >
                            <Pause size={14} /> Pause
                          </Button>
                        ) : sub.status === 'paused' ? (
                          <Button
                            variant="secondary"
                            className="flex-1 gap-2 text-xs font-black uppercase tracking-wider bg-green-500/10 text-green-600 hover:bg-green-500/25 border-transparent"
                            onClick={() => setConfirmModal({ id: sub.id, action: 'resume' })}
                            disabled={isUpdating}
                          >
                            <Play size={14} /> Resume
                          </Button>
                        ) : null}

                        <Button
                          variant="outline"
                          className="flex-1 gap-2 text-xs font-black uppercase tracking-wider text-red-500 hover:text-white hover:bg-red-500 border-red-200 dark:border-red-900/30"
                          onClick={() => setConfirmModal({ id: sub.id, action: 'cancel' })}
                          disabled={isUpdating}
                        >
                          <Trash2 size={14} /> Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Billing History Section */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-text-secondary mb-4 flex items-center gap-2">
                      <Receipt size={14} /> Subscription Billing History
                    </h4>
                    {billingHistory.length === 0 ? (
                      <p className="text-xs text-text-secondary italic bg-stone-50 dark:bg-slate-900/20 p-4 rounded-2xl text-center">
                        Billing renewal history is empty. Renewals will show up here after schedule.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3 max-h-48 overflow-y-auto pr-1">
                        {billingHistory.map((item) => (
                          <div 
                            key={item.id}
                            className="flex items-center justify-between p-4 bg-stone-50/50 dark:bg-slate-900/20 border border-stone-50 dark:border-slate-800 rounded-2xl text-xs hover:border-accent-primary/20 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                              <div>
                                <p className="font-bold text-text-primary">Renewal Order #{item.id.slice(-8).toUpperCase()}</p>
                                <p className="text-[10px] text-text-secondary font-medium">{new Date(item.created_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-black text-text-primary">${(item.total / 100).toFixed(2)}</span>
                              <button
                                onClick={() => setSelectedInvoice(item)}
                                className="text-[10px] font-black uppercase tracking-widest text-accent-primary group-hover:underline"
                              >
                                Invoice
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-2xl border border-stone-100 dark:border-slate-700 text-center"
          >
            <AlertCircle className="mx-auto mb-4 text-accent-primary" size={48} />
            <h3 className="text-2xl font-black text-text-primary mb-2 capitalize">{confirmModal.action} Subscription</h3>
            <p className="text-sm text-text-secondary mb-8">
              Are you sure you want to {confirmModal.action} this organic harvest subscription? This operation takes effect immediately.
            </p>
            <div className="flex gap-4">
              <Button 
                variant="outline" 
                className="flex-1 font-bold text-xs uppercase tracking-wider"
                onClick={() => setConfirmModal(null)}
              >
                No, Keep It
              </Button>
              <Button 
                className="flex-1 font-bold text-xs uppercase tracking-wider"
                onClick={() => handleAction(confirmModal.id, confirmModal.action)}
              >
                Yes, {confirmModal.action}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Invoice Modal */}
      <AnimatePresence>
        {selectedInvoice && (
          <InvoiceModal order={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
        )}
      </AnimatePresence>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default CustomerSubscriptions;
