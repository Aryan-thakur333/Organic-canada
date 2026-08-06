import React from 'react';

const GoogleAuthButton = ({ 
  onClick, 
  isLoading, 
  disabled,
  error 
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      aria-label="Continue with Google"
      className="w-full flex items-center justify-center gap-3 h-[48px] rounded-2xl font-bold text-stone-700 bg-white border-2 border-stone-100 hover:bg-stone-50 hover:border-stone-200 transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <img 
        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
        alt="" 
        className="w-5 h-5 shrink-0" 
      />
      <span>
        {isLoading ? 'Connecting to Google...' : 'Continue with Google'}
      </span>
    </button>
  );
};

export default GoogleAuthButton;
