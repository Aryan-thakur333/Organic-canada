import React from 'react';

const AuthHeader = ({ title, subtitle, icon: Icon, iconClassName = "" }) => {
  return (
    <div className="text-center mb-8">
      {Icon && (
        <div className={`inline-flex p-3 rounded-2xl mb-4 ${iconClassName}`}>
          <Icon size={28} />
        </div>
      )}
      <h1 className="text-3xl font-black mb-2 text-stone-900">{title}</h1>
      {subtitle && (
        <p className="text-stone-500 text-sm font-medium">{subtitle}</p>
      )}
    </div>
  );
};

export default AuthHeader;
