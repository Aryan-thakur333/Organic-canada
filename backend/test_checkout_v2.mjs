import Medusa from '@medusajs/js-sdk';

const sdk = new Medusa({
  baseUrl: 'http://127.0.0.1:9000',
  publishableKey: 'pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431'
});

async function run() {
  console.log("0. Fetching region...");
  const { regions } = await sdk.store.region.list({ limit: 1 });
  const regionId = regions[0]?.id;
  if (!regionId) throw new Error("No active regions found.");

  console.log("1. Creating cart...");
  const { cart } = await sdk.store.cart.create({ region_id: regionId });
  console.log("Cart ID:", cart.id);

  console.log("2. Adding item...");
  const { products } = await sdk.store.product.list({ limit: 1 });
  const variantId = products[0].variants[0].id;
  await sdk.store.cart.createLineItem(cart.id, { variant_id: variantId, quantity: 1 });

  console.log("3. Creating payment collection...");
  const pcRes = await sdk.client.fetch(`/store/payment-collections`, {
    method: 'POST',
    body: { cart_id: cart.id }
  });
  const pcId = pcRes.payment_collection.id;
  console.log("Payment Collection ID:", pcId);

  console.log("4. Initiating payment session...");
  const sessionRes = await sdk.store.payment.initiatePaymentSession(
    pcId,
    {
      provider_id: 'pp_system_default'
    }
  );
  console.log("Payment Session created:", !!sessionRes.payment_collection);
  console.log("Session Data:", JSON.stringify(sessionRes.payment_collection.payment_sessions, null, 2));
}

run().catch(e => {
  console.error("FAILED:", e.message);
  if (e.response) {
      console.error("Response:", JSON.stringify(e.response.data, null, 2));
  }
});
