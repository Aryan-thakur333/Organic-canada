import React, { useState, Component } from 'react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { AlertCircle } from 'lucide-react';

// Error Boundary to prevent React render crashes from bringing down the whole app
class PayPalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("PayPal Component crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-3xl bg-red-50 border border-red-200 text-center">
          <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
          <p className="font-bold text-red-600 mb-1">PayPal is currently unavailable</p>
          <p className="text-sm text-red-500">Please go back and select another payment method.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const CheckoutPaypalPanelInner = ({ amountCents, currency, onPaidSuccess }) => {
  const [error, setError] = useState(null);
  
  // Safe fallbacks for properties that might cause toUpperCase crashes
  const safeCurrency = typeof currency === 'string' ? currency.toUpperCase() : "USD";
  const clientId = (import.meta && import.meta.env && import.meta.env.VITE_PAYPAL_CLIENT_ID) || "test";
  
  const initialOptions = {
    "client-id": clientId,
    currency: safeCurrency,
    intent: "capture",
  };

  const amount = (amountCents / 100).toFixed(2);

  return (
    <div className="w-full">
      {error && (
        <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-3">
          <AlertCircle className="text-red-500 shrink-0" size={20} />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      
      <PayPalScriptProvider options={initialOptions}>
        <PayPalButtons
          style={{ layout: "vertical", shape: "rect", color: "gold" }}
          createOrder={(data, actions) => {
            return actions.order.create({
              purchase_units: [
                {
                  amount: {
                    value: amount,
                    currency_code: safeCurrency
                  },
                },
              ],
            });
          }}
          onApprove={(data, actions) => {
            return actions.order.capture().then((details) => {
              onPaidSuccess({ method: 'paypal', details });
            }).catch(err => {
              setError("Payment capture failed. Please try again.");
              console.error("PayPal capture error:", err);
            });
          }}
          onError={(err) => {
            setError("PayPal encountered an error. Please try again.");
            console.error("PayPal error:", err);
          }}
          onCancel={() => {
            setError("Payment was cancelled.");
          }}
        />
      </PayPalScriptProvider>
    </div>
  );
};

const CheckoutPaypalPanel = (props) => (
  <PayPalErrorBoundary>
    <CheckoutPaypalPanelInner {...props} />
  </PayPalErrorBoundary>
);

export default CheckoutPaypalPanel;
