import React from 'react';

const Input = ({ label, error, className = '', ...props }) => {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-bold uppercase tracking-wider text-gray-700 ml-1">
          {label}
        </label>
      )}
      <input
        className={`w-full rounded-2xl border-2 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition-all outline-none
          ${error
            ? 'border-red-400 focus:border-red-500'
            : 'border-gray-300 focus:border-accent-primary'
          }`}
        {...props}
      />
      {error && <span className="text-[10px] font-bold text-red-500 ml-1 uppercase">{error}</span>}
    </div>
  );
};

export default Input;
