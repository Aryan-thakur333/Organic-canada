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
  const headers = { "Authorization": `Bearer ${token}` };

  const res = await fetch(`${BASE}/admin/products?q=icecream&fields=id,title,*variants`, { headers });
  const data = await res.json();
  const product = data.products?.[0];
  console.log("Product:", JSON.stringify(product, null, 2));

  if (!product) return;
  for (const v of product.variants) {
    console.log(`Variant: ${v.id} Manage inventory: ${v.manage_inventory}`);
    const invRes = await fetch(`${BASE}/admin/variants/${v.id}/inventory`, { headers });
    const invData = await invRes.text();
    console.log("Inventory:", invData);
  }
}
run();
