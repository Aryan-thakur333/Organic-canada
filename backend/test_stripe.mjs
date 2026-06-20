import Medusa from "@medusajs/js-sdk";

async function testStripe() {
  const sdk = new Medusa.default({ baseUrl: "http://localhost:9000", publishableKey: "pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431" });
  try {
    const { regions } = await sdk.store.region.list();
    if (!regions.length) {
      console.log("No regions");
      return;
    }
    const region = regions[0];
    console.log("Region:", region.id, region.payment_providers?.map(p => p.id));
    
    const { cart } = await sdk.store.cart.create({ region_id: region.id, email: "test@test.com" });
    console.log("Cart created:", cart.id);

    const providers = await sdk.store.payment.listPaymentProviders({ region_id: region.id });
    console.log("Providers for region:", providers.payment_providers.map(p => p.id));
    
    const stripe = providers.payment_providers.find(p => p.id.includes("stripe"));
    if (!stripe) {
      console.log("Stripe provider not found in region");
      return;
    }

    // Add an item so cart has a total
    const { products } = await sdk.store.product.list({ limit: 1 });
    if (products.length) {
      const variant = products[0].variants?.[0];
      if (variant) {
        await sdk.store.cart.createLineItem(cart.id, { variant_id: variant.id, quantity: 1 });
        console.log("Added line item to cart");
      }
    }

    console.log("Initiating payment session with provider:", stripe.id);
    const result = await sdk.store.payment.initiatePaymentSession(cart, { provider_id: stripe.id, data: {} });
    console.log("Payment session initiated:", result);
  } catch (e) {
    console.error("Error:", e);
  }
}
testStripe();
