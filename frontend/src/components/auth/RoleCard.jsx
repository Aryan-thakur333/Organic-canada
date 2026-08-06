import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const RoleCard = ({ 
  id, 
  title, 
  subtitle, 
  icon: Icon, 
  isSelected, 
  onClick,
  activeColorClass = "border-[#594236] bg-[#594236]/[0.03]",
  iconActiveColorClass = "text-[#594236]",
  iconBgClass = "bg-[#FDFBF7] text-stone-500 border border-stone-200"
}) => {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={() => onClick(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(id);
        }
      }}
      className={`relative w-full p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 group focus:outline-none focus-visible:ring-4 focus-visible:ring-[#594236]/30 ${
        isSelected 
          ? activeColorClass
          : "border-stone-100 bg-white hover:border-stone-300 hover:shadow-sm"
      }`}
    >
      <div className={`p-3 rounded-xl transition-colors shrink-0 flex items-center justify-center ${isSelected ? iconActiveColorClass + ' bg-white shadow-[0_2px_10px_rgb(0,0,0,0.06)] border border-transparent' : iconBgClass}`}>
        <Icon size={24} strokeWidth={2.2} />
      </div>
      <div className="flex-1 text-left min-w-0 pr-6">
        <h3 className={`font-black text-lg leading-none mb-1.5 transition-colors ${isSelected ? 'text-stone-900' : 'text-stone-700 group-hover:text-stone-900'}`}>
          {title}
        </h3>
        <p className={`text-xs font-semibold leading-relaxed truncate ${isSelected ? 'text-stone-600' : 'text-stone-500'}`}>
          {subtitle}
        </p>
      </div>
      
      <div className={`absolute right-4 sm:right-5 transition-all duration-300 ease-out ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-75'} ${iconActiveColorClass}`}>
        <CheckCircle2 size={24} fill="currentColor" className="text-white" />
      </div>
    </motion.div>
  );
};

export default RoleCard;
