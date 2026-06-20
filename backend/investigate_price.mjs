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

  const res = await fetch(`${BASE}/admin/products?q=icecream&fields=id,title,*variants,*variants.prices`, { headers });
  const data = await res.json();
  const product = data.products?.[0];
  console.log("Product:", JSON.stringify(product, null, 2));
}
run();
