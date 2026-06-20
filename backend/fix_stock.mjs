/**
 * Fix script: Creates a stock location, links it to the sales channel,
 * and adds inventory for all product variants so carts work.
 */

const BASE = "http://localhost:9000";

async function adminLogin() {
  const res = await fetch(`${BASE}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@admin.com", password: "supersecret" })
  });
  const data = await res.json();
  if (!data.token) throw new Error("Login failed: " + JSON.stringify(data));
  console.log("✅ Admin logged in");
  return data.token;
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

async function run() {
  const token = await adminLogin();
  
  // 1. Get all sales channels
  const { data: scData } = await api(token, "GET", "/admin/sales-channels?limit=10");
  const salesChannel = scData.sales_channels?.[0];
  if (!salesChannel) throw new Error("No sales channel found");
  console.log("✅ Sales channel:", salesChannel.id, salesChannel.name);

  // 2. Check existing stock locations
  const { data: slData } = await api(token, "GET", "/admin/stock-locations?limit=10");
  console.log("Existing stock locations:", slData.stock_locations?.length ?? 0);

  let stockLocationId;
  if (slData.stock_locations?.length > 0) {
    stockLocationId = slData.stock_locations[0].id;
    console.log("✅ Using existing stock location:", stockLocationId);
  } else {
    // 3. Create a stock location
    const { data: newSl, status } = await api(token, "POST", "/admin/stock-locations", {
      name: "Default Warehouse",
      address: {
        address_1: "123 Main Street",
        city: "Delhi",
        country_code: "IN"
      }
    });
    if (status !== 200 && status !== 201) {
      throw new Error("Failed to create stock location: " + JSON.stringify(newSl));
    }
    stockLocationId = newSl.stock_location?.id;
    console.log("✅ Created stock location:", stockLocationId);
  }

  // 4. Link stock location to sales channel
  const { data: linkData, status: linkStatus } = await api(token, "POST",
    `/admin/stock-locations/${stockLocationId}/sales-channels`,
    { add: [salesChannel.id] }
  );
  console.log("Link sales channel status:", linkStatus, JSON.stringify(linkData).slice(0, 100));

  // 5. Get all product variants
  const { data: prodData } = await api(token, "GET", "/admin/products?limit=100&fields=id,title,*variants");
  const products = prodData.products ?? [];
  console.log("Products found:", products.length);

  // 6. Get all inventory items
  const { data: invData } = await api(token, "GET", "/admin/inventory-items?limit=200");
  const inventoryItems = invData.inventory_items ?? [];
  console.log("Inventory items found:", inventoryItems.length);

  // 7. For each inventory item, create stock level at our location if missing
  let stocked = 0;
  for (const invItem of inventoryItems) {
    // Check if stock level exists
    const { data: levelData } = await api(token, "GET",
      `/admin/inventory-items/${invItem.id}/location-levels?location_id[]=${stockLocationId}`
    );
    const levels = levelData.inventory_levels ?? [];
    
    if (levels.length === 0) {
      // Create stock level
      const { status: slStatus } = await api(token, "POST",
        `/admin/inventory-items/${invItem.id}/location-levels`,
        { location_id: stockLocationId, stocked_quantity: 1000 }
      );
      if (slStatus === 200 || slStatus === 201) {
        stocked++;
        console.log("  ✅ Stocked inventory item:", invItem.id, "qty: 1000");
      } else {
        console.log("  ⚠️ Failed to stock:", invItem.id, "status:", slStatus);
      }
    } else {
      console.log("  ℹ️ Already has stock level:", invItem.id);
    }
  }

  console.log(`\n✅ Done! Stocked ${stocked} inventory items at location ${stockLocationId}`);
  console.log("🛒 You can now add items to cart!");
}

run().catch(console.error);
