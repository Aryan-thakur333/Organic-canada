async function run() {
  const publishableKey = "pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431";
  const headers = { "x-publishable-api-key": publishableKey, "Content-Type": "application/json" };

  const pRes = await fetch("http://localhost:9000/store/products?limit=100", { headers });
  const products = (await pRes.json()).products;
  
  const cartRes = await fetch("http://localhost:9000/store/carts", { method: "POST", headers, body: JSON.stringify({}) });
  const cartId = (await cartRes.json()).cart.id;

  const fields = "id,region_id,currency_code,email,*items,*items.variant,+items.variant.inventory_quantity,*items.product,*shipping_methods,*region,*promotions,*payment_collection,*payment_collection.payment_sessions";
  const url = `http://localhost:9000/store/carts/${cartId}/line-items?fields=${encodeURIComponent(fields)}`;

  for (const p of products) {
    for (const v of p.variants) {
      console.log(`Adding variant ${v.id} from ${p.title}...`);
      const liRes = await fetch(url, {
        method: "POST", headers, body: JSON.stringify({ variant_id: v.id, quantity: 1 })
      });
      if (liRes.status !== 200) {
        console.log(`❌ ERROR on variant ${v.id} - Status: ${liRes.status}`);
        console.log(await liRes.text());
      } else {
        console.log(`✅ Success for variant ${v.id}`);
      }
    }
  }
}
run();
