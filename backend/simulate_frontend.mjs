import Medusa from '@medusajs/js-sdk';

const sdk = new Medusa({
  baseUrl: 'http://localhost:9000',
  publishableKey: 'pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431'
});

async function simulate() {
  try {
    console.log("1. Creating cart...");
    const { regions } = await sdk.store.region.list();
    const region = regions[0];
    const { cart } = await sdk.store.cart.create({ region_id: region.id });
    console.log(`Cart created: ${cart.id}`);

    console.log("2. Adding item...");
    const { products } = await sdk.store.product.list({ limit: 1 });
    const variant = products[0].variants[0];
    await sdk.store.cart.createLineItem(cart.id, { variant_id: variant.id, quantity: 1 });
    console.log("Item added.");

    console.log("3. Initiating payment session...");
    // Need to set email and address first for some flows
    await sdk.store.cart.update(cart.id, { email: "test@test.com" });
    
    const { payment_collection } = await sdk.store.payment.initiatePaymentSession(cart, {
      provider_id: "pp_stripe_stripe",
      data: {}
    });
    console.log("Payment session initiated!");
    console.log(JSON.stringify(payment_collection, null, 2));
  } catch (e) {
    console.error("SIMULATION FAILED:");
    if (e.response) {
      console.error(`Status: ${e.response.status}`);
      console.error(JSON.stringify(e.response.data, null, 2));
    } else {
      console.error(e.message);
    }
  }
}

simulate();
