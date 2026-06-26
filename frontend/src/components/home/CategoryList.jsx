import React from 'react';
import { motion } from 'framer-motion';
import { Apple, Carrot, Milk, Croissant, Beef, Fish } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { homeBackgrounds } from '../../config/homeBackgrounds';

const categories = [
  { name: 'Fruits', id: 'fruits', icon: <Apple />, color: 'bg-red-50 dark:bg-red-900/20 text-red-500' },
  { name: 'Vegetables', id: 'vegetables', icon: <Carrot />, color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-500' },
  { name: 'Dairy', id: 'dairy', icon: <Milk />, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-500' },
  { name: 'Bakery', id: 'bakery', icon: <Croissant />, color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-500' },
  { name: 'Meat', id: 'meat', icon: <Beef />, color: 'bg-rose-50 dark:bg-rose-900/20 text-rose-500' },
  { name: 'Seafood', id: 'seafood', icon: <Fish />, color: 'bg-teal-50 dark:bg-teal-900/20 text-teal-500' },
];

const CategoryList = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative overflow-hidden py-20 bg-bg-secondary"
      style={{
        backgroundImage: `url(${homeBackgrounds.categories})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <div className="absolute inset-0 bg-white/88 dark:bg-slate-950/86" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg-secondary via-bg-secondary/90 to-bg-secondary dark:from-slate-950 dark:via-slate-950/90 dark:to-slate-950" />
      <div className="container-custom relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-black mb-4">Browse Categories</h2>
          <p className="text-text-secondary">Freshly harvested organic food categorized for your ease.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -5 }}
              onClick={() => navigate(`/category/${cat.id}`)}
              className="flex flex-col items-center gap-4 group cursor-pointer rounded-[2rem] bg-white/70 dark:bg-slate-900/70 p-4 shadow-sm backdrop-blur-sm transition-all hover:bg-white dark:hover:bg-slate-900"
            >
              <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all duration-300 shadow-sm group-hover:shadow-lg ${cat.color}`}>
                {React.cloneElement(cat.icon, { size: 32 })}
              </div>
              <span className="text-sm font-bold text-text-primary group-hover:text-accent-primary transition-colors">
                {cat.name}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoryList;
