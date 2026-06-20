import { useEffect, useMemo, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import StripePaymentForm from "../checkout/StripePaymentForm";
import { createCheckoutPaymentIntent } from "../../services/checkoutApi";

const stripePk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

/**
 * @param {object} props
 * @param {number} props.amountCents
 * @param {string} [props.currency]
 * @param {boolean} [props.disabled]
 * @param {string | null} [props.clientSecret] Medusa payment session secret — skips payment-server when set.
 * @param {{ name: string; email: string; phone: string; address: string }} [props.customerDetails]
 * @param {(args: { paymentIntentId: string }) => void | Promise<void>} props.onPaidSuccess
 */
export default function CheckoutStripePanel({
  amountCents,
  currency = "usd",
  disabled = false,
  clientSecret: externalClientSecret = null,
  customerDetails,
  onPaidSuccess,
}) {
  const [stripePromise] = useState(() => (stripePk ? loadStripe(stripePk) : null));
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const appearance = useMemo(
    () => ({
      theme: "stripe",
      variables: {
        colorPrimary: "#4f46e5",
        borderRadius: "12px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      },
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    const tid = window.setTimeout(() => {
      if (cancelled) return;

      if (!stripePk) {
        setError("Missing VITE_STRIPE_PUBLISHABLE_KEY. Add it to frontend/.env");
        setLoading(false);
        return;
      }

      if (externalClientSecret) {
        setLoading(false);
        setError("");
        setClientSecret(externalClientSecret);
        setPaymentIntentId("");
        return;
      }

      // If we are in Medusa mode, we WAIT for the externalClientSecret.
      // We know we are in Medusa mode if the prop was passed as "" (empty string)
      // rather than null.
      if (externalClientSecret === "") {
        setLoading(true);
        setError("");
        return;
      }

      if (!Number.isFinite(amountCents) || amountCents < 50) {
        setError("Cart total is too small for card payment (minimum $0.50).");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setClientSecret("");
      setPaymentIntentId("");

      (async () => {
        try {
          const { clientSecret: secret, paymentIntentId: pi } = await createCheckoutPaymentIntent(
            amountCents,
            currency
          );
          if (cancelled) return;
          setClientSecret(secret);
          setPaymentIntentId(pi || "");
        } catch (e) {
          if (cancelled) return;
          setError(e?.message || "Could not start card payment");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [amountCents, currency, externalClientSecret]);

  if (!stripePk) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Configure <code className="rounded bg-white/80 px-1">VITE_STRIPE_PUBLISHABLE_KEY</code> in{" "}
        <code className="rounded bg-white/80 px-1">frontend/.env</code> and restart Vite.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-600">
        <span
          className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"
          aria-hidden
        />
        <span className="text-sm font-medium">Preparing secure card payment…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
        {error}
      </div>
    );
  }

  if (!clientSecret || !stripePromise) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Card</h3>
      <p className="mt-1 text-xs text-slate-500">
        {externalClientSecret
          ? "Card payment is processed by Stripe through your Medusa backend."
          : "Amount is taken from your cart total including tax. If you change the cart, this form refreshes."}
      </p>
      <div className="mt-4">
        <Elements
          key={clientSecret}
          stripe={stripePromise}
          options={
            clientSecret
              ? { clientSecret, appearance }
              : {
                  appearance,
                  amount: amountCents,
                  currency: currency.toLowerCase(),
                  mode: "payment",
                }
          }
        >
          <StripePaymentForm
            disabled={disabled}
            customerDetails={customerDetails}
            onPaid={async (paymentIntent) => {
              const id = paymentIntent?.id || paymentIntentId;
              if (!id) throw new Error("Missing payment intent");
              await onPaidSuccess({ paymentIntentId: id });
            }}
          />
        </Elements>
      </div>
    </div>
  );
}
