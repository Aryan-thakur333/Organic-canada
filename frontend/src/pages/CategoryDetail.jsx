import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, SlidersHorizontal, Grid, List } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/common/Skeleton';
import { listStoreProducts } from '../services/medusa/productService';

const CategoryDetail = () => {
  const { id } = useParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryName, setCategoryName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCategoryProducts = async () => {
      setLoading(true);
      try {
        const categoryHandle = String(id || '').toLowerCase();
        const { products } = await listStoreProducts({
          category_handle: categoryHandle,
          limit: 100,
        });
        setProducts(products);
        setCategoryName(categoryHandle.charAt(0).toUpperCase() + categoryHandle.slice(1));
      } catch (error) {
        console.error('Failed to fetch category products:', error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCategoryProducts();
  }, [id]);

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        <div className="flex flex-col gap-8 mb-12">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-accent-primary transition-colors"
          >
            <ArrowLeft size={18} /> Back
          </button>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl md:text-6xl font-black text-text-primary mb-4">{categoryName} Collection.</h1>
              <p className="text-text-secondary max-w-lg">
                Explore our curated selection of fresh organic {categoryName.toLowerCase()}. 
                Direct from local farms to your kitchen.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[...Array(8)].map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-sm border border-stone-100 dark:border-slate-700">
            <h3 className="text-2xl font-black mb-2">No products in this category</h3>
            <p className="text-text-secondary">We're currently harvesting more goods. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {products.map((product) => (
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

export default CategoryDetail;
