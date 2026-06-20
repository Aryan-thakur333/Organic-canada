import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const stripe = new Stripe(process.env.STRIPE_API_KEY);

async function checkPI(piId) {
  try {
    const pi = await stripe.paymentIntents.retrieve(piId);
    console.log("Payment Intent Status:", pi.status);
    console.log("Amount:", pi.amount);
    console.log("Metadata:", JSON.stringify(pi.metadata, null, 2));
  } catch (error) {
    console.error("Error checking PI:", error.message);
  }
}

const piId = process.argv[2] || "pi_3TXawfDmxHahpFvJ1PFKu1lA";
checkPI(piId);
