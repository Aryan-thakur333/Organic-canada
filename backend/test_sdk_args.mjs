import Medusa from '@medusajs/js-sdk';

const sdk = new Medusa({
  baseUrl: 'http://localhost:9000',
  publishableKey: 'pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431'
});

async function simulate() {
  try {
    const { regions } = await sdk.store.region.list();
    const region = regions[0];
    const { cart } = await sdk.store.cart.create({ region_id: region.id });
    await sdk.store.cart.update(cart.id, { email: "test@test.com" });
    
    console.log("Testing with cart OBJECT...");
    try {
        await sdk.store.payment.initiatePaymentSession(cart, { provider_id: "pp_stripe_stripe", data: {} });
        console.log("Success with object.");
    } catch (e) {
        console.log("Failed with object:", e.message);
    }

    console.log("Testing with cart ID...");
    try {
        await sdk.store.payment.initiatePaymentSession(cart.id, { provider_id: "pp_stripe_stripe", data: {} });
        console.log("Success with ID.");
    } catch (e) {
        console.log("Failed with ID:", e.message);
    }
  } catch (e) {
    console.error(e.message);
  }
}

simulate();
