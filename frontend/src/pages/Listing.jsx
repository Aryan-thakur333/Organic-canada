import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, SlidersHorizontal, Search, Grid, List, ArrowUpDown } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/common/Skeleton';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import { listStoreProducts } from '../services/medusa/productService';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

const Listing = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('grid'); // grid or list

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const { products } = await listStoreProducts({ limit: 100 });
        setProducts(products);
      } catch (error) {
        console.error('Listing error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const filteredAndSortedProducts = useMemo(() => {
    let result = products.filter(p => 
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (sortBy === 'price-low') {
      result.sort((a, b) => (a.variants?.[0]?.prices?.[0]?.amount || 0) - (b.variants?.[0]?.prices?.[0]?.amount || 0));
    } else if (sortBy === 'price-high') {
      result.sort((a, b) => (b.variants?.[0]?.prices?.[0]?.amount || 0) - (a.variants?.[0]?.prices?.[0]?.amount || 0));
    } else if (sortBy === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  }, [products, searchQuery, sortBy]);

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        {/* Header */}
        <div className="flex flex-col gap-8 mb-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl md:text-6xl font-black text-text-primary mb-4">Our Garden.</h1>
              <p className="text-text-secondary max-w-lg">
                Freshly picked organic products from our local farms. 
                Filter through our wide variety of organic excellence.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-white dark:bg-slate-800 rounded-2xl p-1 shadow-sm border border-stone-100 dark:border-slate-700">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-xl transition-colors ${viewMode === 'grid' ? 'bg-accent-primary text-white' : 'text-text-secondary'}`}
                >
                  <Grid size={18} />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-xl transition-colors ${viewMode === 'list' ? 'bg-accent-primary text-white' : 'text-text-secondary'}`}
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={20} />
              <input 
                type="text"
                placeholder="Search our garden..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border-2 border-stone-100 dark:border-slate-700 rounded-[2rem] py-4 pl-12 pr-6 outline-none focus:border-accent-primary transition-all text-sm font-semibold"
              />
            </div>
            
            <div className="flex w-full lg:w-auto gap-4">
              <div className="relative flex-1 lg:min-w-[200px]">
                <ArrowUpDown className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
                <select 
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full appearance-none bg-white dark:bg-slate-800 border-2 border-stone-100 dark:border-slate-700 rounded-[2rem] py-4 pl-12 pr-10 outline-none focus:border-accent-primary transition-all text-sm font-bold"
                >
                  <option value="newest">Newest First</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="title">Name: A-Z</option>
                </select>
              </div>
              
              <button className="flex items-center gap-2 bg-white dark:bg-slate-800 border-2 border-stone-100 dark:border-slate-700 rounded-[2rem] px-8 py-4 text-sm font-bold hover:border-accent-primary transition-all">
                <Filter size={18} /> Filters
              </button>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[...Array(8)].map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : filteredAndSortedProducts.length === 0 ? (
          <div className="py-40 text-center">
            <div className="inline-flex p-6 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-400 dark:text-slate-600 mb-6">
              <Search size={48} />
            </div>
            <h3 className="text-2xl font-black mb-2">No products found</h3>
            <p className="text-text-secondary">Try adjusting your search or filters to find what you're looking for.</p>
            <Button className="mt-8" onClick={() => { setSearchQuery(''); setSortBy('newest'); }}>
              Clear All Filters
            </Button>
          </div>
        ) : (
          <div className={`grid gap-8 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1'}`}>
            {filteredAndSortedProducts.map((product) => (
              <ProductCard key={product.id} item={product} />
            ))}
          </div>
        )}
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default Listing;
