import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AuthAlert = ({ type = "error", message }) => {
  if (!message) return null;

  const styles = {
    error: {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-700",
      icon: <AlertCircle size={18} className="mt-0.5 shrink-0" />
    },
    success: {
      bg: "bg-green-50",
      border: "border-green-200",
      text: "text-green-700",
      icon: <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
    },
    info: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      text: "text-blue-700",
      icon: <Info size={18} className="mt-0.5 shrink-0" />
    }
  };

  const currentStyle = styles[type] || styles.error;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        role="alert"
        aria-live="polite"
        className={`mb-5 flex items-start gap-3 rounded-2xl border ${currentStyle.bg} ${currentStyle.border} p-4 text-sm font-semibold ${currentStyle.text}`}
      >
        {currentStyle.icon}
        <span className="leading-tight">{message}</span>
      </motion.div>
    </AnimatePresence>
  );
};

export default AuthAlert;
