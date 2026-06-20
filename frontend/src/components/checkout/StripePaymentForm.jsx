import React, { useState } from 'react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Lock, AlertCircle } from 'lucide-react';
import Button from '../common/Button';

const StripePaymentForm = ({ onPaid, disabled, customerDetails }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage('');

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order-success`,
        },
        redirect: 'if_required',
      });

      if (error) {
        setErrorMessage(error.message || 'Payment failed');
        return;
      }

      if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
        await onPaid(paymentIntent);
        return;
      }

      setErrorMessage('Payment was not completed. Please try again.');
    } catch (err) {
      setErrorMessage(err?.message || 'A payment error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-stone-200 dark:border-slate-700 shadow-inner">
        <PaymentElement 
          options={{
            layout: 'tabs',
          }} 
        />
      </div>

      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl text-red-600 text-sm font-medium"
          >
            <AlertCircle size={18} /> {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-4">
        <Button
          size="lg"
          onClick={handleSubmit}
          className="w-full gap-2"
          isLoading={isProcessing}
          disabled={disabled || !stripe || !elements}
        >
          <Lock size={18} /> Pay Securely
        </Button>
        
        <div className="flex items-center justify-center gap-4 text-[10px] font-bold text-text-secondary uppercase tracking-widest">
          <span className="flex items-center gap-1"><ShieldCheck size={12} /> SSL Encrypted</span>
          <span className="flex items-center gap-1"><Lock size={12} /> Stripe Secure</span>
        </div>
      </div>
    </div>
  );
};

export default StripePaymentForm;
