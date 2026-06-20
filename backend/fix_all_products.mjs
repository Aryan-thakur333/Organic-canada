const BASE = "http://localhost:9000";

async function adminLogin() {
  const res = await fetch(`${BASE}/auth/user/emailpass`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@admin.com", password: "supersecret" })
  });
  return (await res.json()).token;
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

async function run() {
  const token = await adminLogin();
  console.log("✅ Logged in");

  // 1. Get stock location
  const { data: slData } = await api(token, "GET", "/admin/stock-locations?limit=10");
  const stockLocId = slData.stock_locations?.[0]?.id;
  console.log("Stock location:", stockLocId);

  // 2. Get sales channel
  const { data: scData } = await api(token, "GET", "/admin/sales-channels?limit=10");
  const salesChannelId = scData.sales_channels?.[0]?.id;
  console.log("Sales channel:", salesChannelId);

  // 3. Fix icecream: set manage_inventory to false so it doesn't need stock
  const { data: prodData } = await api(token, "GET", "/admin/products?q=icecream&fields=id,title,*variants,*variants.prices");
  const icecream = prodData.products?.[0];
  
  if (!icecream) {
    console.log("No icecream product found");
    return;
  }
  
  console.log("Icecream variant:", icecream.variants[0]?.id);
  console.log("Icecream prices:", JSON.stringify(icecream.variants[0]?.prices));

  const variant = icecream.variants[0];

  // Add prices if missing
  if (!variant.prices || variant.prices.length === 0) {
    console.log("Adding prices to icecream...");
    const { status } = await api(token, "POST", `/admin/products/${icecream.id}`, {
      variants: [{
        id: variant.id,
        manage_inventory: false,
        prices: [
          { currency_code: "eur", amount: 500 },
          { currency_code: "usd", amount: 600 }
        ]
      }]
    });
    console.log("Add prices status:", status);
  } else {
    // Just ensure manage_inventory is false
    console.log("Prices exist, ensuring manage_inventory=false...");
    const { status } = await api(token, "POST", `/admin/products/${icecream.id}`, {
      variants: [{ id: variant.id, manage_inventory: false }]
    });
    console.log("Update status:", status);
  }

  // 4. Also fix Burger product the same way
  const { data: burgerData } = await api(token, "GET", "/admin/products?q=Burger&fields=id,title,*variants,*variants.prices");
  const burger = burgerData.products?.[0];
  if (burger) {
    for (const bv of burger.variants) {
      if (!bv.prices || bv.prices.length === 0) {
        console.log(`Adding prices to Burger variant ${bv.id}...`);
        await api(token, "POST", `/admin/products/${burger.id}`, {
          variants: [{
            id: bv.id,
            manage_inventory: false,
            prices: [
              { currency_code: "eur", amount: 800 },
              { currency_code: "usd", amount: 999 }
            ]
          }]
        });
      }
    }
  }

  // 5. Ensure ALL products with manage_inventory=true have stock at our location
  const { data: allProds } = await api(token, "GET", "/admin/products?limit=100&fields=id,title,*variants");
  for (const prod of allProds.products || []) {
    for (const v of prod.variants || []) {
      if (v.manage_inventory) {
        // Check inventory items for this variant
        const { data: invData } = await api(token, "GET", `/admin/inventory-items?sku=${v.sku || ""}&limit=100`);
        for (const item of invData.inventory_items || []) {
          const { data: lvlData } = await api(token, "GET", `/admin/inventory-items/${item.id}/location-levels?location_id[]=${stockLocId}`);
          if ((lvlData.inventory_levels || []).length === 0) {
            console.log(`  Stocking ${item.id} for ${prod.title}...`);
            await api(token, "POST", `/admin/inventory-items/${item.id}/location-levels`, {
              location_id: stockLocId, stocked_quantity: 1000
            });
          }
        }
      }
    }
  }

  // 6. Verify icecream can now be added to cart
  const publishableKey = "pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431";
  const storeHeaders = { "x-publishable-api-key": publishableKey, "Content-Type": "application/json" };
  
  const cartRes = await fetch(`${BASE}/store/carts`, { method: "POST", headers: storeHeaders, body: JSON.stringify({}) });
  const cartId = (await cartRes.json()).cart.id;
  
  const liRes = await fetch(`${BASE}/store/carts/${cartId}/line-items`, {
    method: "POST", headers: storeHeaders,
    body: JSON.stringify({ variant_id: variant.id, quantity: 1 })
  });
  console.log("\n🧪 Add icecream to cart:", liRes.status === 200 ? "✅ SUCCESS!" : `❌ FAILED (${liRes.status})`);
  if (liRes.status !== 200) {
    console.log(await liRes.text());
  }

  console.log("\n✅ All done! Clear your browser localStorage or hard-refresh the frontend to get a fresh cart.");
}

run().catch(console.error);
