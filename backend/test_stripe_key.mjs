import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.STRIPE_API_KEY;
console.log(`Testing Stripe with key starting with: ${key?.slice(0, 7)}...`);

const stripe = new Stripe(key);
try {
  const balance = await stripe.balance.retrieve();
  console.log("Stripe balance retrieve successful.");
} catch (e) {
  console.error("Stripe test failed:");
  console.error(e.message);
}
