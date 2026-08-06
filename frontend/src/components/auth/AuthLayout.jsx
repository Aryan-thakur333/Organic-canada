import React from 'react';
import { Leaf, CheckCircle2, Truck, ShieldCheck, Briefcase } from 'lucide-react';
import { motion } from 'framer-motion';

import heroBg from "../../assets/auth/organic-canada-auth-background.png";

const features = [
  { icon: CheckCircle2, text: "Verified Sellers" },
  { icon: Truck, text: "Fresh Delivery" },
  { icon: ShieldCheck, text: "Secure Marketplace" },
  { icon: Briefcase, text: "B2B Ready" }
];

const brandPanelStyle = {
  backgroundColor: "#332016",
  backgroundImage: `
    linear-gradient(
      90deg,
      rgba(30, 16, 10, 0.88) 0%,
      rgba(48, 28, 18, 0.74) 45%,
      rgba(67, 39, 24, 0.44) 100%
    ),
    url(${heroBg})
  `,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
};

const AuthLayout = ({ children, title = "", subtitle = "" }) => {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col lg:flex-row overflow-x-hidden font-sans">
      
      {/* ── Left Brand Panel ────────────────────────────────────────────── */}
      {/* Mobile/Tablet Header */}
      <div 
        className="lg:hidden w-full text-white p-6 relative overflow-hidden flex-shrink-0"
        style={brandPanelStyle}
      >
        <div className="relative z-10 flex items-center gap-3">
          <div className="bg-white p-2 rounded-xl text-[#594236] shadow-md">
            <Leaf className="w-5 h-5" />
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-xl font-black tracking-tighter text-white uppercase">
              Organic <span className="text-[#C16D45]">Canada</span>
            </span>
          </div>
        </div>
      </div>

      {/* Desktop Panel */}
      <section 
        className="relative hidden min-h-screen overflow-hidden text-white lg:flex lg:w-1/2 lg:flex-col p-12 lg:p-16 justify-between"
        style={brandPanelStyle}
      >
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div>
            <div className="flex items-center gap-3 mb-16">
              <div className="bg-white p-2.5 rounded-[14px] text-[#594236] shadow-xl">
                <Leaf className="w-7 h-7" />
              </div>
              <div className="flex flex-col items-start leading-none">
                <span className="text-3xl font-black tracking-tighter text-white uppercase">
                  Organic <span className="text-[#C16D45]">Canada</span>
                </span>
                <span className="text-[11px] font-bold tracking-[0.2em] text-[#D8CDC4] uppercase mt-1">
                  Fresh Grocery
                </span>
              </div>
            </div>
            
            <h1 className="text-4xl lg:text-5xl xl:text-6xl font-black mb-6 leading-[1.1] max-w-xl text-white">
              Fresh, local, and organic.
            </h1>
            <p className="text-[#f1ece7] text-lg lg:text-xl max-w-md font-medium leading-relaxed mb-10">
              Discover trusted products, verified sellers, and a seamless marketplace experience for customers, sellers, and B2B buyers.
            </p>

            <div className="flex flex-col gap-4">
              {features.map((item, index) => (
                <div key={index} className="flex items-center gap-4 bg-white/5 hover:bg-white/10 transition-colors px-4 py-3 rounded-2xl w-fit backdrop-blur-sm border border-white/10">
                  <item.icon className="w-5 h-5 text-[#E6A87C]" />
                  <span className="font-semibold text-white tracking-wide text-sm">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12">
            <p className="text-sm font-bold text-[#D8CDC4] opacity-90 border-l-2 border-[#C16D45] pl-4">
              Trusted by organic buyers and sellers across Canada.
            </p>
          </div>
        </div>
      </section>

      {/* ── Right Form Panel ────────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 lg:p-12 relative flex-1 min-h-[calc(100vh-80px)] lg:min-h-screen">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-[420px] md:max-w-[480px] bg-white rounded-[2rem] shadow-[0_8px_40px_rgb(0,0,0,0.06)] p-6 sm:p-10 border border-stone-100 relative z-10 my-4"
        >
          {children}
        </motion.div>
      </div>
      
    </div>
  );
};

export default AuthLayout;
