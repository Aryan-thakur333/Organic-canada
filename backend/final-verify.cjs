async function finalVerify() {
  const BASE_URL = "http://localhost:9000"
  
  const loginRes = await fetch(`${BASE_URL}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@eatsie.com", password: "Password123!" }),
  })
  const { token } = await loginRes.json()
  if (!token) { console.error("Login failed"); return }
  console.log("✅ Admin login OK\n")

  // 1. Full admin orders query (was crashing with 500)
  const fields = "id,status,created_at,email,display_id,custom_display_id,payment_status,fulfillment_status,total,currency_code,*customer,*sales_channel,*payment_collections"
  const ordersRes = await fetch(`${BASE_URL}/admin/orders?fields=${fields}&limit=20&offset=0&order=-created_at`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  console.log(`[Phase 1] Admin Orders List: ${ordersRes.status === 200 ? "✅" : "❌"} (status: ${ordersRes.status})`)
  if (ordersRes.status === 200) {
    const d = await ordersRes.json()
    console.log(`         Returned ${d.orders?.length} orders (count=${d.count})`)
  }

  // 2. Previously-bad individual orders
  for (const id of ['order_01KWPX4YY9A0EK11BBE6NE96S7', 'order_01KWPWXAK5NVKY400RAS5C9BJE']) {
    const r = await fetch(`${BASE_URL}/admin/orders/${id}?fields=id,status,*payment_collections`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    console.log(`[Phase 1] Individual order ${id.split('_')[1].slice(0,8)}: ${r.status === 200 ? "✅" : "❌"} (${r.status})`)
  }

  // 3. Admin products list (digital products appearing)
  const prodRes = await fetch(`${BASE_URL}/admin/products?limit=5&status[]=published`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  console.log(`\n[Phase 3] Admin Products List: ${prodRes.status === 200 ? "✅" : "❌"} (status: ${prodRes.status})`)
  if (prodRes.status === 200) {
    const pd = await prodRes.json()
    const digital = pd.products?.filter(p => p.metadata?.is_digital)
    console.log(`         Total products: ${pd.count}`)
    console.log(`         Digital products: ${digital?.length ?? 0}`)
  }

  // 4. Admin /admin/products/digital GET
  const digListRes = await fetch(`${BASE_URL}/admin/products/digital`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  console.log(`\n[Phase 3] GET /admin/products/digital: ${digListRes.status === 200 ? "✅" : "❌"} (status: ${digListRes.status})`)
  if (digListRes.status === 200) {
    const dd = await digListRes.json()
    console.log(`         Digital assets in module: ${dd.products?.length ?? 0}`)
  }
}

finalVerify().catch(console.error)
