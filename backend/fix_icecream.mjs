const BASE = "http://localhost:9000";

async function adminLogin() {
  const res = await fetch(`${BASE}/auth/user/emailpass`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@admin.com", password: "supersecret" })
  });
  return (await res.json()).token;
}

async function run() {
  const token = await adminLogin();
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };

  const variantId = "variant_01KRKBBFAFQF7B8BYF6857XRTQ"; // icecream

  // 1. Add prices
  console.log("Adding prices...");
  const priceRes = await fetch(`${BASE}/admin/products/prod_01KRKBBF0Q6A1FV465V7X49F9M`, {
    method: "POST", headers,
    body: JSON.stringify({
      variants: [{
        id: variantId,
        manage_inventory: true,
        prices: [
          { currency_code: "eur", amount: 5 },
          { currency_code: "usd", amount: 6 }
        ]
      }]
    })
  });
  console.log("Update product status:", priceRes.status);
  
  // 2. Fetch inventory items to find the one for this variant
  console.log("Checking inventory item...");
  const invRes = await fetch(`${BASE}/admin/products?q=icecream&fields=id,*variants,*variants.inventory_items`, { headers });
  const data = await invRes.json();
  const invItems = data.products?.[0]?.variants?.[0]?.inventory_items;
  
  if (invItems && invItems.length > 0) {
    const invItemId = invItems[0].inventory_item_id;
    // 3. Stock it in the Canada warehouse (which was sloc_01KRN6HFESFA0PMHNS4X97Y6G8)
    const slData = await fetch(`${BASE}/admin/stock-locations`, { headers }).then(r => r.json());
    const stockLocId = slData.stock_locations?.[0]?.id;
    
    if (stockLocId) {
       console.log("Stocking at", stockLocId);
       const slStatus = await fetch(`${BASE}/admin/inventory-items/${invItemId}/location-levels`, {
         method: "POST", headers,
         body: JSON.stringify({ location_id: stockLocId, stocked_quantity: 100 })
       });
       console.log("Stock status:", slStatus.status);
    }
  }
}
run();
