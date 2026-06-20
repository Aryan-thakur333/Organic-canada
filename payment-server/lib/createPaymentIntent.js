import Stripe from "stripe";

/**
 * @param {{ stripeSecretKey?: string; amount: number; currency: string }} opts
 */
export async function createStripePaymentIntent({ stripeSecretKey, amount, currency }) {
  if (!stripeSecretKey) {
    const err = new Error("Stripe is not configured. Set STRIPE_SECRET_KEY in payment-server/.env");
    err.code = "STRIPE_NOT_CONFIGURED";
    throw err;
  }

  const amountNum = Number(amount);
  const cur = String(currency || "usd").toLowerCase();

  if (!Number.isFinite(amountNum) || amountNum < 50) {
    const err = new Error("Amount must be at least 50 in the smallest currency unit (e.g. cents).");
    err.code = "INVALID_AMOUNT";
    throw err;
  }

  const stripe = new Stripe(stripeSecretKey);
  const rounded = Math.round(amountNum);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: rounded,
    currency: cur,
    automatic_payment_methods: { enabled: true },
    metadata: {
      total_cents: String(rounded),
    },
  });

  return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
}
