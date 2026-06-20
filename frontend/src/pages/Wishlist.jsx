import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ShoppingBag, Trash2, ArrowRight, ShoppingCart } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import { removeFromWishlist } from '../redux/wishlistSlice';
import { addToCart } from '../redux/cartSlice';
import useToast from '../hooks/useToast';
import { resolveMedusaImageUrl, PRODUCT_IMAGE_FALLBACK } from '../utils/medusaImage';

const Wishlist = () => {
  const { items } = useSelector(state => state.wishlist);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleAddToCart = (item) => {
    const price = item.variants?.[0]?.prices?.[0]?.amount / 100 || 0;
    dispatch(addToCart({
      id: item.id,
      title: item.title,
      price,
      image: resolveMedusaImageUrl(item.thumbnail),
      quantity: 1
    }));
    showToast(`${item.title} added to cart`, "success");
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl md:text-6xl font-black text-text-primary mb-4">Saved Items.</h1>
            <p className="text-text-secondary max-w-lg">Your collection of organic favorites. Move them to your basket whenever you're ready.</p>
          </div>
          <p className="text-sm font-bold text-accent-primary">{items.length} items saved</p>
        </div>

        {items.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex p-8 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-400 dark:text-slate-600 mb-8">
              <Heart size={64} />
            </div>
            <h2 className="text-3xl font-black mb-4">Your wishlist is empty</h2>
            <p className="text-text-secondary mb-10">Start saving your favorite organic products by tapping the heart icon.</p>
            <Button size="lg" onClick={() => navigate('/listing')}>
              Go to Garden
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            <AnimatePresence>
              {items.map((item, i) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 overflow-hidden group"
                >
                  <div className="relative aspect-square overflow-hidden bg-stone-50 dark:bg-slate-900">
                    <img 
                      src={resolveMedusaImageUrl(item.thumbnail)} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => e.target.src = PRODUCT_IMAGE_FALLBACK}
                    />
                    <button 
                      onClick={() => dispatch(removeFromWishlist(item.id))}
                      className="absolute top-4 right-4 p-3 rounded-full bg-white/80 backdrop-blur-md text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-lg"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="p-6">
                    <h3 className="text-lg font-bold mb-2 group-hover:text-accent-primary transition-colors line-clamp-1">{item.title}</h3>
                    <p className="text-sm text-text-secondary mb-6 line-clamp-1">{item.description || "Premium organic product"}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-black text-accent-primary">
                        ${(item.variants?.[0]?.prices?.[0]?.amount / 100 || 0).toFixed(2)}
                      </span>
                      <button 
                        onClick={() => handleAddToCart(item)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-100 dark:bg-slate-700 text-text-primary hover:bg-accent-primary hover:text-white transition-all font-bold text-xs"
                      >
                        <ShoppingCart size={16} /> Add
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default Wishlist;
