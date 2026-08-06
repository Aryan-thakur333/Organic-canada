import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion } from 'framer-motion';
import { ShoppingCart, Heart, Eye, Star, Download, Package } from 'lucide-react';
import { addToCart } from '../redux/cartSlice';
import { toggleWishlist, removeFromWishlist } from '../redux/wishlistSlice';
import useToast from '../hooks/useToast';
import useMedusaCart from '../hooks/useMedusaCart';
import { isMedusaConfigured } from '../config/publicEnv';
import { resolveMedusaImageUrl, PRODUCT_IMAGE_FALLBACK } from '../utils/medusaImage';
import { getDisplayPrice } from '../utils/pricing';
import { commerceFeatures } from '../config/commerceFeatures';

const ProductCard = ({ item, region = null, regionSlug = null, onQuickView }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { addVariant } = useMedusaCart();
  const [isHovered, setIsHovered] = useState(false);

  const priceInfo = getDisplayPrice(item, { region });
  const price = priceInfo.amount;

  const handleAddToCart = async (e) => {
    e.stopPropagation();
    if (commerceFeatures.bundledProducts && item.metadata?.product_type === 'bundle') {
      navigate(regionSlug ? `/shop/${regionSlug}/product/${item.id}` : `/product/${item.id}`);
      return;
    }
    const variantId = item.variants?.[0]?.id;

    if (!priceInfo.hasPrice) {
      showToast("Price unavailable in this region", "error");
      return;
    }

    if (isMedusaConfigured() && variantId) {
      try {
        await addVariant({ variantId, quantity: 1, currencyCode: priceInfo.currencyCode });
        showToast(`${item.title} added to cart`, "success");
        return;
      } catch (error) {
        console.error('Failed to add Medusa product to cart:', error);
        showToast(error?.message || "Failed to add to cart", "error");
        return;
      }
    }

    if (!priceInfo.hasPrice) return;
    dispatch(addToCart({
      id: item.id,
      variantId,
      title: item.title,
      price: price || 0,
      image: resolveMedusaImageUrl(item.thumbnail),
      quantity: 1
    }));
    showToast(`${item.title} added to cart`, "success");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative bg-white dark:bg-slate-800 rounded-[2rem] overflow-hidden shadow-premium transition-all duration-300 border border-stone-100/50 dark:border-slate-700/50"
      onClick={() => navigate(regionSlug ? `/shop/${regionSlug}/product/${item.id}` : `/product/${item.id}`)}
    >
      {/* Image Container */}
      <div className="relative aspect-square overflow-hidden bg-stone-50 dark:bg-slate-900">
        <motion.img
          src={resolveMedusaImageUrl(item.thumbnail)}
          alt={item.title}
          animate={{ scale: isHovered ? 1.05 : 1 }}
          transition={{ duration: 0.6 }}
          className="w-full h-full object-cover"
          onError={(e) => (e.target.src = PRODUCT_IMAGE_FALLBACK)}
        />
        
        {/* Badges */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <span className="px-3 py-1 rounded-full bg-accent-primary text-white text-[10px] font-black uppercase tracking-wider">
            Organic
          </span>
          {(item.metadata?.is_digital === true || item.metadata?.is_digital === 'true' || item.type?.value === 'Digital Product') && (
            <span className="px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <Download size={10} /> Digital
            </span>
          )}
          {commerceFeatures.bundledProducts && item.metadata?.product_type === 'bundle' && (
            <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1"><Package size={10} /> Bundle</span>
          )}
        </div>

        {/* Action Overlay */}
        <div className={`absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 flex items-center justify-center gap-3 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              dispatch(toggleWishlist(item));
              showToast("Wishlist updated", "success");
            }}
            className="p-3 rounded-full bg-white text-text-primary hover:bg-accent-primary hover:text-white transition-colors shadow-lg"
          >
            <Heart size={20} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onQuickView?.(item);
            }}
            className="p-3 rounded-full bg-white text-text-primary hover:bg-accent-primary hover:text-white transition-colors shadow-lg"
            aria-label={`Quick view ${item.title}`}
          >
            <Eye size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="flex items-center gap-1 mb-2">
          {[...Array(5)].map((_, i) => (
            <Star key={i} size={12} className={i < 4 ? "fill-yellow-400 text-yellow-400" : "text-stone-300 dark:text-slate-600"} />
          ))}
          <span className="text-[10px] font-bold text-text-secondary ml-1">(42)</span>
        </div>
        
        <h3 className="text-lg font-bold text-text-primary mb-1 line-clamp-1 group-hover:text-accent-primary transition-colors">
          {item.title}
        </h3>
        <p className="text-sm text-text-secondary mb-4 line-clamp-1">
          {item.description || "Premium organic product from our farm."}
        </p>

        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-accent-primary">
              {priceInfo.formatted}
            </span>
          </div>
          <button 
            onClick={handleAddToCart}
            disabled={!priceInfo.hasPrice}
            className="p-3 rounded-2xl bg-stone-100 dark:bg-slate-700 text-text-primary hover:bg-accent-primary hover:text-white transition-all shadow-sm disabled:opacity-40 disabled:hover:bg-stone-100 disabled:hover:text-text-primary dark:disabled:hover:bg-slate-700"
          >
            <ShoppingCart size={20} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default ProductCard;
