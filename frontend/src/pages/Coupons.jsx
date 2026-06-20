import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Ticket, 
  Copy, 
  Check, 
  ChevronLeft, 
  ShoppingBag, 
  Percent, 
  Truck, 
  Sparkles,
  Info
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import apiClient from '../services/apiClient';
import useCart from '../hooks/useCart';
import useToast from '../hooks/useToast';

const Coupons = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { applyCouponCode, couponCode, formatPrice } = useCart();
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState('');

  useEffect(() => {
    const fetchPromotions = async () => {
      try {
        const res = await apiClient.get('/store/promotions');
        setPromotions(res.promotions || []);
      } catch (err) {
        console.error('Failed to load promotions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPromotions();
  }, []);

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast(`Code "${code}" copied to clipboard!`, 'success');
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const handleApply = async (code) => {
    const success = await applyCouponCode(code);
    if (success) {
      navigate('/cart');
    }
  };

  const getPromoIcon = (code) => {
    if (code === 'FREESHIP') return <Truck className="text-blue-500" size={32} />;
    if (code === 'SAVE50') return <Sparkles className="text-orange-500" size={32} />;
    return <Percent className="text-green-500" size={32} />;
  };

  const getPromoBg = (code) => {
    if (code === 'FREESHIP') return 'from-blue-500/10 to-indigo-500/5 dark:from-blue-500/20';
    if (code === 'SAVE50') return 'from-orange-500/10 to-amber-500/5 dark:from-orange-500/20';
    return 'from-green-500/10 to-emerald-500/5 dark:from-green-500/20';
  };

  const getPromoBorder = (code) => {
    if (code === 'FREESHIP') return 'border-blue-100 dark:border-blue-900/30';
    if (code === 'SAVE50') return 'border-orange-100 dark:border-orange-900/30';
    return 'border-green-100 dark:border-green-900/30';
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        <div className="flex items-center gap-4 mb-10">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-4xl font-black text-text-primary">Eatsie Offers.</h1>
            <p className="text-sm text-text-secondary">Claim extra discounts and premium savings on your organic produce.</p>
          </div>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-48 rounded-[2rem] bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 animate-pulse" />
            ))}
          </div>
        ) : promotions.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex p-8 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-400 mb-8">
              <Ticket size={64} />
            </div>
            <h2 className="text-2xl font-black mb-4">No active promotions available</h2>
            <p className="text-text-secondary mb-8">Check back later for seasonal harvests and coupons.</p>
            <Button onClick={() => navigate('/listing')}>Explore Garden</Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8">
            {promotions.map((promo, i) => {
              const isApplied = couponCode === promo.code;
              return (
                <motion.div
                  key={promo.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex flex-col bg-white dark:bg-slate-800 border-2 rounded-[2.5rem] p-8 relative overflow-hidden group shadow-premium hover:shadow-premium-hover transition-all ${getPromoBorder(promo.code)}`}
                >
                  {/* Decorative background glow */}
                  <div className={`absolute top-0 right-0 w-40 h-40 rounded-full blur-[60px] opacity-60 -mr-16 -mt-16 bg-gradient-to-br ${getPromoBg(promo.code)}`} />
                  
                  <div className="flex gap-6 items-start relative z-10">
                    <div className={`w-16 h-16 rounded-[1.5rem] bg-gradient-to-br ${getPromoBg(promo.code)} flex items-center justify-center shrink-0`}>
                      {getPromoIcon(promo.code)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-2xl font-black text-text-primary uppercase tracking-tight">{promo.code}</h3>
                        {isApplied && (
                          <span className="bg-accent-primary/10 text-accent-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-accent-primary/20">
                            Active in Basket
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-text-primary mb-1">{promo.label}</p>
                      <p className="text-xs text-text-secondary leading-relaxed mb-4">{promo.description}</p>
                    </div>
                  </div>

                  <div className="mt-auto pt-6 border-t border-stone-50 dark:border-slate-700/50 flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center relative z-10">
                    <div className="flex flex-col gap-1">
                      {promo.min_cart_value > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] text-text-secondary font-bold uppercase tracking-wider">
                          <Info size={12} /> Min. Value: ₹{promo.min_cart_value}
                        </div>
                      )}
                      <div className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">
                        Usage count: {promo.used || 0} claimed
                      </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => handleCopy(promo.code)}
                        className="p-3 bg-stone-50 hover:bg-stone-100 dark:bg-slate-900 dark:hover:bg-slate-800 rounded-xl text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center"
                        title="Copy coupon code"
                      >
                        {copiedCode === promo.code ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                      </button>
                      <Button
                        variant={isApplied ? "outline" : "primary"}
                        onClick={() => handleApply(promo.code)}
                        disabled={isApplied}
                        className="px-6 py-2.5 text-xs font-black uppercase tracking-wider"
                      >
                        {isApplied ? "Applied" : "Apply Code"}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default Coupons;
