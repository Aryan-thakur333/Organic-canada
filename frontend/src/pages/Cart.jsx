import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowRight, 
  Ticket,
  ChevronLeft
} from 'lucide-react';
import B2BPriceBadge from '../components/common/B2BPriceBadge';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import useMedusaCart from '../hooks/useMedusaCart';
import useCart from '../hooks/useCart';
import useToast from '../hooks/useToast';
import useB2BCompany from '../hooks/useB2BCompany';
import { resolveMedusaImageUrl, PRODUCT_IMAGE_FALLBACK } from '../utils/medusaImage';

const Cart = () => {
  const { items } = useSelector((state) => state.cart);
  const { 
    formatPrice, 
    grandTotal, 
    tax, 
    couponDiscount, 
    couponCode,
    applyCouponCode,
    removeCouponCode
  } = useCart();
  const { setLineQuantity, removeLine } = useMedusaCart();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [couponInput, setCouponInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(null);
  const { company: b2bCompany } = useB2BCompany();
  const isApprovedB2B = b2bCompany?.status === 'approved' || b2bCompany?.status === 'active';

  const handleUpdateQuantity = async (lineId, newQty) => {
    if (newQty < 1) return;
    setIsUpdating(lineId);
    try {
      await setLineQuantity(lineId, newQty);
    } catch (error) {
      showToast("Failed to update quantity", "error");
    } finally {
      setIsUpdating(null);
    }
  };

  const handleRemove = async (lineId) => {
    setIsUpdating(lineId);
    try {
      await removeLine(lineId);
      showToast("Item removed from cart", "success");
    } catch (error) {
      showToast("Failed to remove item", "error");
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        <div className="flex items-center gap-4 mb-10">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-4xl font-black text-text-primary">Your Basket.</h1>
        </div>

        {items.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex p-8 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-400 dark:text-slate-600 mb-8">
              <ShoppingBag size={64} />
            </div>
            <h2 className="text-3xl font-black mb-4">Your basket is empty</h2>
            <p className="text-text-secondary mb-10">Looks like you haven't added any organic goodness yet.</p>
            <Button size="lg" onClick={() => navigate('/listing')}>
              Go to Garden
            </Button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-12 items-start">
            {/* Items List */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <AnimatePresence>
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col sm:flex-row gap-6 p-6 bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm border border-stone-100 dark:border-slate-700 relative group"
                  >
                    <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shrink-0 bg-stone-50 dark:bg-slate-900">
                      <img 
                        src={resolveMedusaImageUrl(item.image)} 
                        className="w-full h-full object-cover"
                        onError={(e) => e.target.src = PRODUCT_IMAGE_FALLBACK}
                      />
                    </div>
                    
                    <div className="flex flex-col flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-lg font-bold text-text-primary group-hover:text-accent-primary transition-colors">
                          {item.title}
                        </h3>
                        <button 
                          onClick={() => handleRemove(item.id)}
                          className="p-2 text-text-secondary hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      
                      <p className="text-sm text-text-secondary mb-4">
                        Premium Quality Organic Item
                      </p>
                      {isApprovedB2B && (
                        <div className="mb-4">
                          <B2BPriceBadge compact />
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center bg-stone-50 dark:bg-slate-900 rounded-xl p-1">
                          <button 
                            disabled={isUpdating === item.id}
                            onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                            className="p-2 hover:text-accent-primary transition-colors disabled:opacity-30"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                          <button 
                            disabled={isUpdating === item.id}
                            onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                            className="p-2 hover:text-accent-primary transition-colors disabled:opacity-30"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <span className="text-lg font-black text-accent-primary">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Summary */}
            <div className="sticky top-32 flex flex-col gap-8 p-8 bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700">
              <h2 className="text-2xl font-black">Order Summary</h2>

              {/* B2B badge at top of summary */}
              {isApprovedB2B && (
              <div className="-mt-2">
                <B2BPriceBadge />
                  <p className="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    B2B Wholesale Pricing Applied for {b2bCompany.company_name}
                  </p>
              </div>
              )}
              
              <div className="flex flex-col gap-4 border-b border-stone-100 dark:border-slate-700 pb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary font-medium">Subtotal</span>
                  <span className="font-bold">{formatPrice(grandTotal - tax + couponDiscount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary font-medium">Estimated Tax</span>
                  <span className="font-bold">{formatPrice(tax)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary font-medium">Shipping</span>
                  <span className="text-green-500 font-bold uppercase tracking-tighter">Calculated at next step</span>
                </div>
                {couponCode && (
                  <div className="flex justify-between text-sm">
                    <span className="text-accent-primary font-bold">Discount ({couponCode})</span>
                    <span className="text-accent-primary font-bold">-{formatPrice(couponDiscount)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center">
                <span className="text-lg font-black">Total</span>
                <span className="text-3xl font-black text-accent-primary">{formatPrice(grandTotal)}</span>
              </div>

              {/* Promo Code */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-text-secondary ml-1">Promo Code</label>
                {couponCode ? (
                  <div className="flex justify-between items-center bg-green-500/10 dark:bg-green-500/20 p-4 rounded-2xl border border-green-500/20">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <Ticket size={18} />
                      <span className="font-bold text-sm">"{couponCode}" Applied</span>
                    </div>
                    <button 
                      onClick={removeCouponCode} 
                      className="text-xs font-black uppercase text-red-500 hover:text-red-600 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Ticket className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
                      <input 
                        type="text"
                        placeholder="Enter code"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        className="w-full bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-2xl py-3 pl-12 pr-4 outline-none text-sm font-bold transition-all"
                      />
                    </div>
                    <Button variant="secondary" onClick={async () => {
                      const success = await applyCouponCode(couponInput);
                      if (success) setCouponInput('');
                    }}>Apply</Button>
                  </div>
                )}
              </div>

              <Button size="lg" className="w-full gap-2 mt-4" onClick={() => navigate('/checkout')}>
                Checkout Now <ArrowRight size={18} />
              </Button>
              
              <p className="text-[10px] text-center text-text-secondary font-medium">
                Free shipping on orders over $50. Safe & Secure Payments via Stripe.
              </p>
            </div>
          </div>
        )}
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default Cart;
