import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ShoppingBag, ShieldCheck, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from './common/Button';

const Hero = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-[90vh] flex items-center pt-20 overflow-hidden bg-bg-primary">
      {/* Decorative Elements */}
      <div className="absolute top-20 right-[-10%] w-[500px] h-[500px] bg-accent-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-accent-secondary/10 rounded-full blur-3xl" />

      <div className="container-custom relative z-10 grid lg:grid-cols-2 gap-12 items-center">
        {/* Text Content */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <motion.span 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-block px-4 py-1.5 rounded-full bg-accent-primary/10 text-accent-primary text-xs font-bold uppercase tracking-widest mb-6"
          >
            Organic & Fresh Always
          </motion.span>
          <h1 className="text-5xl md:text-7xl font-black leading-[1.1] text-text-primary mb-6">
            Pure Organic <br />
            <span className="text-accent-primary">Excellence</span> for Your Home.
          </h1>
          <p className="text-lg text-text-secondary mb-10 max-w-lg leading-relaxed">
            Experience the finest selection of locally sourced organic products. 
            From farm to your table, we ensure 100% quality and freshness.
          </p>

          <div className="flex flex-wrap gap-4">
            <Button size="lg" className="gap-2" onClick={() => navigate('/listing')}>
              Shop Now <ArrowRight size={18} />
            </Button>
            <Button variant="secondary" size="lg" className="gap-2" onClick={() => navigate('/about')}>
              Learn More
            </Button>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-black text-text-primary">20k+</span>
              <span className="text-xs font-bold text-text-secondary uppercase">Customers</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-black text-text-primary">150+</span>
              <span className="text-xs font-bold text-text-secondary uppercase">Farms</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-black text-text-primary">100%</span>
              <span className="text-xs font-bold text-text-secondary uppercase">Organic</span>
            </div>
          </div>
        </motion.div>

        {/* Image Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: 5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative"
        >
          <div className="relative z-10 rounded-[2.5rem] overflow-hidden shadow-2xl">
            <img 
              src="https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1000&auto=format&fit=crop" 
              alt="Organic Food"
              className="w-full h-auto object-cover"
            />
          </div>
          
          {/* Floating Info Cards */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-10 -left-10 z-20 glass p-4 rounded-2xl shadow-premium border border-white/20 flex items-center gap-3"
          >
            <div className="bg-green-500 p-2 rounded-xl text-white">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-sm font-bold">100% Verified</p>
              <p className="text-[10px] text-text-secondary font-medium">Certified Organic</p>
            </div>
          </motion.div>

          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-10 -right-10 z-20 glass p-4 rounded-2xl shadow-premium border border-white/20 flex items-center gap-3"
          >
            <div className="bg-accent-primary p-2 rounded-xl text-white">
              <Truck size={20} />
            </div>
            <div>
              <p className="text-sm font-bold">Fast Delivery</p>
              <p className="text-[10px] text-text-secondary font-medium">Within 24 Hours</p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
