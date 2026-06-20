import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search as SearchIcon, ArrowLeft, X, TrendingUp, Sparkles } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/common/Skeleton';
import { listStoreProducts } from '../services/medusa/productService';
import useDebounce from '../hooks/useDebounce';

const Search = () => {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 500);
  const navigate = useNavigate();

  const trendingSearches = ['Organic Apples', 'Fresh Milk', 'Sourdough Bread', 'Heirloom Tomatoes', 'Wild Salmon'];

  useEffect(() => {
    if (!debouncedQuery) {
      setProducts([]);
      return;
    }

    const performSearch = async () => {
      setLoading(true);
      try {
        const { products } = await listStoreProducts({ q: debouncedQuery });
        setProducts(products);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [debouncedQuery]);

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        <div className="max-w-4xl mx-auto">
          {/* Search Input Area */}
          <div className="relative mb-12">
            <SearchIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-accent-primary" size={24} />
            <input 
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What are you looking for today?"
              className="w-full bg-white dark:bg-slate-800 border-4 border-stone-100 dark:border-slate-700 rounded-[2.5rem] py-6 pl-16 pr-16 outline-none focus:border-accent-primary transition-all text-xl font-bold shadow-premium"
            />
            {query && (
              <button 
                onClick={() => setQuery('')}
                className="absolute right-6 top-1/2 -translate-y-1/2 p-2 hover:bg-stone-100 dark:hover:bg-slate-700 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {!query && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-8"
            >
              <div>
                <div className="flex items-center gap-2 mb-4 text-text-secondary">
                  <TrendingUp size={18} />
                  <h3 className="text-xs font-black uppercase tracking-widest">Trending Searches</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                  {trendingSearches.map(term => (
                    <button 
                      key={term}
                      onClick={() => setQuery(term)}
                      className="px-6 py-3 rounded-2xl bg-white dark:bg-slate-800 border-2 border-stone-50 dark:border-slate-700 text-sm font-bold hover:border-accent-primary hover:text-accent-primary transition-all shadow-sm"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-accent-primary/5 rounded-[2.5rem] p-10 border border-accent-primary/10 flex flex-col items-center text-center">
                <Sparkles className="text-accent-primary mb-4" size={48} />
                <h3 className="text-2xl font-black mb-2">Find Your Fresh</h3>
                <p className="text-text-secondary max-w-sm">Search through our 100% organic inventory of fruits, vegetables, dairy and more.</p>
              </div>
            </motion.div>
          )}

          {query && (
            <div className="flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black">
                  {loading ? 'Searching...' : `Results for "${query}"`}
                </h2>
                {!loading && <p className="text-sm font-bold text-text-secondary">{products.length} found</p>}
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {[...Array(6)].map((_, i) => <ProductCardSkeleton key={i} />)}
                </div>
              ) : products.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {products.map((product) => (
                    <ProductCard key={product.id} item={product} />
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <div className="inline-flex p-8 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-400 dark:text-slate-600 mb-8">
                    <SearchIcon size={64} />
                  </div>
                  <h3 className="text-2xl font-black mb-2">Nothing found</h3>
                  <p className="text-text-secondary">We couldn't find any products matching your search.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default Search;
