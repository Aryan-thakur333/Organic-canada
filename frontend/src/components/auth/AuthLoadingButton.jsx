import React from 'react';
import { Loader2, ArrowRight } from 'lucide-react';

const AuthLoadingButton = ({ 
  children, 
  isLoading, 
  disabled, 
  type = "submit", 
  className = "",
  showArrow = true,
  onClick
}) => {
  return (
    <button
      type={type}
      disabled={isLoading || disabled}
      onClick={onClick}
      className={`w-full flex items-center justify-center gap-2 h-[48px] rounded-2xl font-bold text-white bg-[#594236] hover:bg-[#4A372D] shadow-lg shadow-[#594236]/20 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-[#594236]/20 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {isLoading ? (
        <Loader2 className="animate-spin" size={18} />
      ) : (
        <>
          {children}
          {showArrow && <ArrowRight size={18} />}
        </>
      )}
    </button>
  );
};

export default AuthLoadingButton;
