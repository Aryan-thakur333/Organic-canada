import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const AuthFooter = ({ backLink = "/", backText = "Back Home" }) => {
  return (
    <div className="mt-8 text-center flex flex-col gap-4">
      <Link
        to={backLink}
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-stone-500 hover:text-[#594236] mx-auto transition-colors"
      >
        <ArrowLeft size={14} />
        {backText}
      </Link>
    </div>
  );
};

export default AuthFooter;
