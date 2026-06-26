import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Clock, CheckCircle2, ChevronRight, ShoppingBag, RefreshCw, AlertCircle, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import Skeleton from '../components/common/Skeleton';
import useToast from '../hooks/useToast';
import InvoiceModal from '../components/common/InvoiceModal';
import DigitalDownloadsWidget from '../components/digital/DigitalDownloadsWidget';
import { fetchCustomerOrders } from '../services/apiClient';

const fulfillmentTrackingNumber = (fulfillment) =>
  fulfillment?.metadata?.tracking_number ||
  fulfillment?.metadata?.tracking_code ||
  fulfillment?.display?.tracking_number ||
  fulfillment?.tracking_number ||
  null;

// Detect if a line item is a digital product
const isDigitalItem = (item) => {
  const meta = item?.metadata || {};
  return (
    meta?.is_digital === true ||
    meta?.is_digital === 'true' ||
    meta?.product_type === 'digital'
  );
};

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [downloadsMap, setDownloadsMap] = useState({});
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

      const sortedOrders = rawOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setOrders(sortedOrders);

      // Check if any orders have digital items and pre-fetch download records
      const hasDigitalItems = sortedOrders.some(order =>
        (order.items || []).some(isDigitalItem)
      );

      if (hasDigitalItems) {
        try {
          const res = await fetch('/store/orders/downloads');
          if (res.ok) {
            const json = await res.json();
            const map = {};
            for (const dl of (json.downloads || [])) {
              if (!map[dl.product_id]) map[dl.product_id] = [];
              map[dl.product_id].push(dl);
            }
            setDownloadsMap(map);
          }
        } catch (e) {
          // Non-critical
        }
      }
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

  const hasDigitalInOrder = (order) =>
    (order.items || []).some(isDigitalItem);

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl md:text-6xl font-black text-text-primary mb-4">My Orders.</h1>
            <p className="text-text-secondary max-w-lg">Track your fresh organic harvests and digital purchases from farm to table.</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => navigate('/my-downloads')}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 
                       border border-blue-500/20 text-xs font-black uppercase tracking-wider hover:bg-blue-500/20 transition-all"
            >
              <Download size={14} /> My Downloads
            </button>
            <button 
              onClick={() => fetchOrders(true)}
              className="flex items-center gap-2 text-sm font-bold text-accent-primary hover:text-accent-secondary transition-colors"
            >
              <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
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
              {orders.map((order, i) => {
                const orderHasDigital = hasDigitalInOrder(order);
                const isFullyDigital = orderHasDigital && (order.items || []).every(isDigitalItem);
                return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 overflow-hidden"
                  >
                    <div 
                      className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 cursor-pointer"
                      onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    >
                      <div className="flex items-center gap-6">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${
                          orderHasDigital 
                            ? 'bg-blue-500/10 text-blue-500' 
                            : 'bg-accent-primary/10 text-accent-primary'
                        }`}>
                          {orderHasDigital ? <Download size={28} /> : <Package size={28} />}
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
                            {isFullyDigital ? (
                              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-purple-100 text-purple-600 dark:bg-purple-900/20">
                                Digital Download
                              </span>
                            ) : orderHasDigital ? (
                              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20">
                                Mixed (Physical + Digital)
                              </span>
                            ) : null}
                            {!isFullyDigital && order.fulfillments?.length > 0 && order.fulfillments.some(fulfillmentTrackingNumber) && (
                              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-orange-100 text-orange-600 dark:bg-orange-900/20">
                                Track: {fulfillmentTrackingNumber(order.fulfillments.find(fulfillmentTrackingNumber)) || "Available"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs font-bold text-text-secondary">
                            <span className="flex items-center gap-1"><Clock size={12} /> {new Date(order.created_at).toLocaleDateString()}</span>
                            <span>{(order.items || []).length} Items</span>
                            {orderHasDigital && <span className="text-blue-500">Includes Digital Products</span>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-8 justify-between md:justify-end flex-1">
                        <div className="text-right flex flex-col items-end">
                          <p className="text-xs font-bold text-text-secondary uppercase mb-1 tracking-widest">Total Amount</p>
                          <p className="text-2xl font-black text-accent-primary mb-2">${(order.total / 100).toFixed(2)}</p>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedInvoice(order); }}
                            className="text-[10px] font-black uppercase tracking-widest text-accent-primary hover:text-accent-secondary hover:underline transition-colors"
                          >
                            View Invoice
                          </button>
                        </div>
                        <ChevronRight 
                          size={24} 
                          className={`text-text-secondary transition-transform ${
                            expandedOrder === order.id ? 'rotate-90' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {/* Expanded Content: Items + Digital Downloads */}
                    <AnimatePresence>
                      {expandedOrder === order.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 md:px-8 pb-6 pt-2 border-t border-stone-100 dark:border-slate-700">
                            <div className="flex flex-col gap-4">
                              {(order.items || []).map(item => {
                                const digital = isDigitalItem(item);
                                const itemDownloads = downloadsMap[item.product_id] || [];
                                return (
                                  <div key={item.id}>
                                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-stone-50/50 dark:bg-slate-900/30">
                                      {item.thumbnail && (
                                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shrink-0">
                                          <img src={item.thumbnail} className="w-full h-full object-cover" />
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-text-primary truncate">{item.title}</p>
                                        <p className="text-xs text-text-secondary">
                                          Qty: {item.quantity} × ${(item.unit_price / 100).toFixed(2)}
                                        </p>
                                      </div>
                                      <span className="text-sm font-black text-text-primary shrink-0">
                                        ${((item.unit_price * item.quantity) / 100).toFixed(2)}
                                      </span>
                                      {digital && (
                                        <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/20 
                                                    text-blue-600 dark:text-blue-400 text-[9px] font-black uppercase tracking-wider shrink-0">
                                          Digital
                                        </span>
                                      )}
                                    </div>
                                    {/* Show download widget for digital items */}
                                    {digital && (
                                      <DigitalDownloadsWidget
                                        orderId={order.id}
                                        item={item}
                                        downloadRecord={itemDownloads.find(d => d.product_id === item.product_id) || null}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Quick Item Preview (collapsed state) */}
                    {expandedOrder !== order.id && (
                      <div className="bg-stone-50/50 dark:bg-slate-900/30 px-8 py-4 flex gap-3 overflow-x-auto border-t border-stone-100 dark:border-slate-700">
                        {(order.items || []).slice(0, 8).map(item => (
                          <div 
                            key={item.id} 
                            className={`w-12 h-12 rounded-xl overflow-hidden bg-white dark:bg-slate-800 border shrink-0 relative ${
                              isDigitalItem(item) 
                                ? 'border-blue-200 dark:border-blue-800 ring-2 ring-blue-500/20' 
                                : 'border-stone-100 dark:border-slate-700'
                            }`}
                          >
                            {item.thumbnail ? (
                              <img src={item.thumbnail} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-stone-300 dark:text-slate-600">
                                <Package size={16} />
                              </div>
                            )}
                            {isDigitalItem(item) && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                <Download size={8} className="text-white" />
                              </div>
                            )}
                          </div>
                        ))}
                        {(order.items || []).length > 8 && (
                          <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-slate-800 border border-stone-100 dark:border-slate-700 shrink-0 flex items-center justify-center text-[10px] font-black text-text-secondary">
                            +{order.items.length - 8}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
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
