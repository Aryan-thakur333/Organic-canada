async function run() {
    const pk = 'pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431';
    
    console.log("0. Fetching regions...");
    const regionsRes = await fetch('http://localhost:9000/store/regions', {
        headers: {
            'x-publishable-api-key': pk
        }
    }).then(r => r.json());
    const regionId = regionsRes.regions?.[0]?.id;
    if (!regionId) throw new Error("No active regions found.");

    console.log("1. Creating cart...");
    const cartRes = await fetch('http://localhost:9000/store/carts', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'x-publishable-api-key': pk
        },
        body: JSON.stringify({ region_id: regionId })
    }).then(r => r.json());
    console.log("Cart Res:", JSON.stringify(cartRes, null, 2));
    if (!cartRes.cart) return;
    const cartId = cartRes.cart.id;
    console.log("Cart ID:", cartId);

    console.log("2. Creating payment collection...");
    const pcRes = await fetch('http://localhost:9000/store/payment-collections', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'x-publishable-api-key': pk
        },
        body: JSON.stringify({ cart_id: cartId })
    }).then(r => r.json());
    
    if (pcRes.message) {
        console.error("PC Error:", pcRes.message);
        return;
    }
    const pcId = pcRes.payment_collection.id;
    console.log("PC ID:", pcId);

    console.log("3. Creating payment session...");
    const sessionRes = await fetch(`http://localhost:9000/store/payment-collections/${pcId}/payment-sessions`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'x-publishable-api-key': pk
        },
        body: JSON.stringify({ provider_id: 'pp_stripe_stripe' })
    }).then(r => r.json());

    console.log("Final Res:", JSON.stringify(sessionRes, null, 2));
}

run().catch(e => console.error(e));
