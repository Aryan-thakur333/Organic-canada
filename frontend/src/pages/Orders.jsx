import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Clock, CheckCircle2, ChevronRight, ShoppingBag, RefreshCw, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import Skeleton from '../components/common/Skeleton';
import useToast from '../hooks/useToast';
import InvoiceModal from '../components/common/InvoiceModal';
import { fetchCustomerOrders } from '../services/apiClient';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    
    try {
      const data = await fetchCustomerOrders();
      
      let rawOrders = [];
      if (data && Array.isArray(data.orders)) {
        rawOrders = data.orders;
      } else if (Array.isArray(data)) {
        rawOrders = data;
      }

      if (rawOrders.length === 0) {
        console.warn("[Orders] Backend successfully returned an empty array []. This means you have no orders assigned to your account in this Sales Channel.");
      }

      const sortedOrders = rawOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setOrders(sortedOrders);
    } catch (error) {
      console.error("[Orders] Fetch Error:", error.response?.status, error.response?.data || error.message);
      if (error.response?.status === 401) {
        setOrders([]);
        if (!silent) showToast("Please log in to view orders", "error");
      } else {
        const errMsg = error.response?.data?.message || error.response?.data?.type || "Check console for details";
        if (!silent) showToast(`Failed to load orders: ${errMsg}`, "error");
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
      case 'fulfilled':
      case 'captured':
        return 'bg-green-100 text-green-600 dark:bg-green-900/20';
      case 'pending':
      case 'processing':
        return 'bg-amber-100 text-amber-600 dark:bg-amber-900/20';
      case 'canceled':
        return 'bg-red-100 text-red-600 dark:bg-red-900/20';
      default:
        return 'bg-stone-100 text-stone-600 dark:bg-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl md:text-6xl font-black text-text-primary mb-4">My Orders.</h1>
            <p className="text-text-secondary max-w-lg">Track your fresh organic harvests from farm to table. Real-time updates on every step.</p>
          </div>
          <button 
            onClick={() => fetchOrders(true)}
            className="flex items-center gap-2 text-sm font-bold text-accent-primary hover:text-accent-secondary transition-colors"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} /> Refresh List
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col gap-6">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-[2rem]" />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex p-8 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-400 dark:text-slate-600 mb-8">
              <ShoppingBag size={64} />
            </div>
            <h2 className="text-3xl font-black mb-4">No orders yet</h2>
            <p className="text-text-secondary mb-10">Start your organic journey today and place your first order.</p>
            <Button size="lg" onClick={() => navigate('/listing')}>
              Go to Garden
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <AnimatePresence>
              {orders.map((order, i) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 overflow-hidden group"
                >
                  <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-2xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                        <Package size={32} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3 mb-1">
                          <span className="text-lg font-black text-text-primary">Order #{order.id.slice(-8).toUpperCase()}</span>
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(order.status)}`}>
                            Status: {order.status}
                          </span>
                          {order.payment_status && (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-600 dark:bg-blue-900/20">
                              Payment: {order.payment_status.replace(/_/g, ' ')}
                            </span>
                          )}
                          {order.fulfillment_status && (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-purple-100 text-purple-600 dark:bg-purple-900/20">
                              Fulfillment: {order.fulfillment_status.replace(/_/g, ' ')}
                            </span>
                          )}
                          {order.fulfillments?.length > 0 && order.fulfillments.some(f => f.tracking_links?.length > 0) && (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-orange-100 text-orange-600 dark:bg-orange-900/20">
                              Track: {order.fulfillments.find(f => f.tracking_links?.length > 0).tracking_links[0].tracking_number || "Available"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs font-bold text-text-secondary">
                          <span className="flex items-center gap-1"><Clock size={12} /> {new Date(order.created_at).toLocaleDateString()}</span>
                          <span>{(order.items || []).length} Items</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-8 justify-between md:justify-end flex-1">
                      <div className="text-right flex flex-col items-end">
                        <p className="text-xs font-bold text-text-secondary uppercase mb-1 tracking-widest">Total Amount</p>
                        <p className="text-2xl font-black text-accent-primary mb-2">${(order.total / 100).toFixed(2)}</p>
                        <button 
                          onClick={() => setSelectedInvoice(order)}
                          className="text-[10px] font-black uppercase tracking-widest text-accent-primary hover:text-accent-secondary hover:underline transition-colors"
                        >
                          View Invoice
                        </button>
                      </div>
                      <button 
                        onClick={() => navigate(`/track/${order.id}`)}
                        className="p-4 rounded-2xl bg-stone-100 dark:bg-slate-700 text-text-primary hover:bg-accent-primary hover:text-white transition-all"
                      >
                        <ChevronRight size={24} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Quick Item Preview */}
                  <div className="bg-stone-50/50 dark:bg-slate-900/30 px-8 py-4 flex gap-3 overflow-x-auto border-t border-stone-100 dark:border-slate-700">
                    {(order.items || []).map(item => (
                      <div key={item.id} className="w-12 h-12 rounded-xl overflow-hidden bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 shrink-0">
                        <img src={item.thumbnail} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <Footer />
      <MobileNav />

      <AnimatePresence>
        {selectedInvoice && (
          <InvoiceModal order={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Orders;
