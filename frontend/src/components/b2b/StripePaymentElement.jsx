import { useEffect, useMemo, useState } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import StripePaymentForm from '../checkout/StripePaymentForm';
import { b2bApi } from '../../services/b2bApi';

const stripePk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

export default function StripePaymentElement({ quoteId, amountMinor, currencyCode, onPaid }) {
  const [stripePromise] = useState(() => (stripePk ? loadStripe(stripePk) : null));
  const [clientSecret, setClientSecret] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const appearance = useMemo(() => ({
    theme: 'stripe',
    variables: {
      colorPrimary: '#4f46e5',
      borderRadius: '12px',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setClientSecret('');
    setPaymentIntentId('');

    if (!stripePk) {
      setError('Card payments need VITE_STRIPE_PUBLISHABLE_KEY configured.');
      setLoading(false);
      return () => {};
    }

    b2bApi.createQuoteStripeSession(quoteId)
      .then((res) => {
        if (cancelled) return;
        setClientSecret(res.client_secret || '');
        setPaymentIntentId(res.payment_intent_id || '');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.message || err?.message || 'Could not prepare card payment.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  if (loading) {
    return <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm font-semibold text-text-secondary dark:border-slate-700 dark:bg-slate-900">Preparing secure card payment...</div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>;
  }

  if (!clientSecret || !stripePromise) return null;

  return (
    <Elements key={clientSecret} stripe={stripePromise} options={{ clientSecret, appearance }}>
      <StripePaymentForm
        onPaid={async (paymentIntent) => {
          const id = paymentIntent?.id || paymentIntentId;
          const result = await b2bApi.authorizeQuotePayment(quoteId, { payment_intent_id: id });
          await onPaid(result);
        }}
        customerDetails={null}
      />
    </Elements>
  );
}
