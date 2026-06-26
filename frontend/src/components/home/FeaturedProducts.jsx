import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductCard from '../ProductCard';
import { ProductCardSkeleton } from '../common/Skeleton';
import { listStoreProducts } from '../../services/medusa/productService';
import { homeBackgrounds } from '../../config/homeBackgrounds';

const FeaturedProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { products } = await listStoreProducts({ limit: 4 });
        setProducts(products);
      } catch (error) {
        console.error('Failed to fetch featured products', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  return (
    <section
      className="relative overflow-hidden py-24 bg-bg-primary"
      style={{
        backgroundImage: `url(${homeBackgrounds.bestSellers})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <div className="absolute inset-0 bg-bg-primary/90 dark:bg-slate-950/88" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg-primary via-bg-primary/92 to-bg-primary/76 dark:from-slate-950 dark:via-slate-950/92 dark:to-slate-950/76" />
      <div className="container-custom relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl md:text-5xl font-black mb-4 text-text-primary">Best Sellers</h2>
            <p className="text-text-secondary max-w-lg">Our most loved organic products, delivered fresh to your door every single day.</p>
          </div>
          <Link 
            to="/listing" 
            className="group flex items-center gap-2 text-sm font-bold text-accent-primary hover:text-accent-secondary transition-colors"
          >
            View All Catalog <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {loading ? (
            [...Array(4)].map((_, i) => <ProductCardSkeleton key={i} />)
          ) : (
            products.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <ProductCard item={product} />
              </motion.div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
