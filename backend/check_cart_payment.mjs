import Medusa from "@medusajs/js-sdk";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const sdk = new Medusa({
  baseUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  publishableKey: "pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431",
});

async function checkCart(cartId) {
  try {
    const { cart } = await sdk.store.cart.retrieve(cartId, {
      fields: "+payment_collection.payment_sessions"
    });
    console.log("Cart ID:", cart.id);
    console.log("Payment Collection:", JSON.stringify(cart.payment_collection, null, 2));
    
    if (cart.payment_collection?.payment_sessions) {
      cart.payment_collection.payment_sessions.forEach(s => {
        console.log(`Session: ${s.id}, Provider: ${s.provider_id}`);
        console.log(`Data:`, JSON.stringify(s.data, null, 2));
      });
    }
  } catch (error) {
    console.error("Error retrieving cart:", error.message);
  }
}

const cartId = process.argv[2];
if (cartId) {
  checkCart(cartId);
} else {
  console.log("Please provide a cart ID");
}
