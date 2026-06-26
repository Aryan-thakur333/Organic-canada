import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Package, Download, ArrowRight, Home, ShoppingBag, Loader2 } from 'lucide-react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { clearCart } from '../redux/cartSlice';
import { addOrder } from '../redux/orderSlice';
import { completeCart } from '../services/medusa/checkoutService';
import Navbar from '../components/layout/Navbar';
import Button from '../components/common/Button';
import Footer from '../components/Footer';

const OrderSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const medusaCartId = useSelector((state) => state.cart.medusaCartId);
  
  const [order, setOrder] = useState(location.state?.order || null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [hasDigitalItems, setHasDigitalItems] = useState(false);

  // Detect if order has digital items
  useEffect(() => {
    if (order?.items) {
      const digital = order.items.some((item) => {
        const meta = item.metadata || item.variant?.product?.metadata || {};
        return meta.is_digital === true || meta.is_digital === 'true';
      });
      setHasDigitalItems(digital);
    }
  }, [order]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const paymentIntent = searchParams.get('payment_intent');
    const redirectStatus = searchParams.get('redirect_status');

    if (!order && paymentIntent && redirectStatus === 'succeeded' && medusaCartId) {
      setIsConfirming(true);
      completeCart(medusaCartId)
        .then((result) => {
          if (result.type === 'order') {
            dispatch(clearCart());
            dispatch(addOrder(result.order));
            setOrder(result.order);
            window.history.replaceState({}, '', '/order-success');
          }
        })
        .catch((err) => {
          console.error("Failed to complete cart after Stripe redirect:", err);
        })
        .finally(() => {
          setIsConfirming(false);
        });
    }
  }, [location.search, order, medusaCartId, dispatch]);

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-40 pb-20 container-custom flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center text-white mb-8 shadow-xl shadow-green-500/20"
        >
          <CheckCircle size={48} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-6xl font-black text-text-primary mb-4"
        >
          {hasDigitalItems ? 'Purchase Confirmed!' : 'Order Confirmed!'}
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg text-text-secondary max-w-lg mb-12"
        >
          {hasDigitalItems
            ? 'Your digital products are ready for download. Access them anytime from your Orders or Downloads page.'
            : 'Thank you for your order. We\'ve received your request and our farm is already preparing your fresh organic goods.'}
        </motion.p>

        {isConfirming && (
          <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium mb-12 w-full max-w-md">
            <Loader2 className="animate-spin text-accent-primary mb-4" size={40} />
            <p className="font-bold text-text-primary">Finalizing your order...</p>
            <p className="text-sm text-text-secondary mt-2">Please do not close this page.</p>
          </div>
        )}

        {order && !isConfirming && (
          <>
            {/* Order Summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 w-full max-w-md mb-8"
            >
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-stone-50 dark:border-slate-700 pb-4">
                  <span className="text-sm font-bold text-text-secondary uppercase">Order ID</span>
                  <span className="font-black text-accent-primary">#{order.id.slice(-8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-center border-b border-stone-50 dark:border-slate-700 pb-4">
                  <span className="text-sm font-bold text-text-secondary uppercase">Status</span>
                  <span className="px-3 py-1 bg-green-100 dark:bg-green-900/20 text-green-600 rounded-full text-xs font-black uppercase">Confirmed</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-sm font-bold text-text-secondary uppercase">Total Paid</span>
                  <span className="text-xl font-black text-text-primary">${(order.total / 100).toFixed(2)}</span>
                </div>
              </div>
            </motion.div>

            {/* Digital Download CTA */}
            {hasDigitalItems && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 
                           rounded-[2.5rem] p-8 w-full max-w-md mb-8 text-left"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Download size={28} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-blue-800 dark:text-blue-300">Instant Access</h3>
                    <p className="text-sm text-blue-600 dark:text-blue-400/80">
                      Your digital products are ready to download
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <Button
                    className="w-full gap-2"
                    onClick={() => navigate('/orders')}
                  >
                    <Download size={18} /> Go to Downloads
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full gap-2"
                    onClick={() => navigate('/my-downloads')}
                  >
                    <Package size={18} /> My Downloads Library
                  </Button>
                </div>
              </motion.div>
            )}
          </>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap gap-4 justify-center"
        >
          {hasDigitalItems ? (
            <>
              <Button size="lg" className="gap-2" onClick={() => navigate('/orders')}>
                <Download size={20} /> View Downloads
              </Button>
              <Button variant="secondary" size="lg" className="gap-2" onClick={() => navigate('/')}>
                <Home size={20} /> Back Home
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" className="gap-2" onClick={() => navigate('/orders')}>
                <Package size={20} /> Track Order
              </Button>
              <Button variant="secondary" size="lg" className="gap-2" onClick={() => navigate('/')}>
                <Home size={20} /> Back Home
              </Button>
            </>
          )}
        </motion.div>

        {/* Feature badges — adapt for digital vs physical */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl">
          {hasDigitalItems ? (
            <>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <Download size={24} />
                </div>
                <p className="font-bold text-sm">Instant Download</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <Package size={24} />
                </div>
                <p className="font-bold text-sm">Secure Access</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <CheckCircle size={24} />
                </div>
                <p className="font-bold text-sm">Re-Download Available</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                  <ShoppingBag size={24} />
                </div>
                <p className="font-bold text-sm">Packed with care</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                  <Package size={24} />
                </div>
                <p className="font-bold text-sm">Shipped Fresh</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                  <CheckCircle size={24} />
                </div>
                <p className="font-bold text-sm">Delivered to You</p>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default OrderSuccess;
