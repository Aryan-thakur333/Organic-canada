import { useState } from 'react';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { AlertCircle } from 'lucide-react';
import { b2bApi } from '../../services/b2bApi';

export default function PayPalButtonsWrapper({ quoteId, currencyCode, onPaid }) {
  const [error, setError] = useState('');
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;

  if (!clientId) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
        PayPal needs VITE_PAYPAL_CLIENT_ID configured.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
          <AlertCircle size={18} /> {error}
        </div>
      )}
      <PayPalScriptProvider options={{ 'client-id': clientId, currency: String(currencyCode || 'CAD').toUpperCase(), intent: 'capture' }}>
        <PayPalButtons
          style={{ layout: 'vertical', shape: 'rect' }}
          createOrder={async () => {
            setError('');
            const res = await b2bApi.createQuotePayPalOrder(quoteId);
            return res.paypal_order_id;
          }}
          onApprove={async (data) => {
            const res = await b2bApi.captureQuotePayPalOrder(quoteId, { paypal_order_id: data.orderID });
            await onPaid(res);
          }}
          onError={(err) => {
            setError(err?.message || 'PayPal payment failed.');
          }}
          onCancel={() => setError('PayPal payment was cancelled.')}
        />
      </PayPalScriptProvider>
    </div>
  );
}
