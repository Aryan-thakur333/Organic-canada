async function verifyOrders() {
  const BASE_URL = "http://localhost:9000"
  
  const loginRes = await fetch(`${BASE_URL}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@eatsie.com", password: "Password123!" }),
  })
  const { token } = await loginRes.json()
  
  // Test full query that was crashing the admin panel
  const fields = "id,status,created_at,email,display_id,custom_display_id,payment_status,fulfillment_status,total,currency_code,*customer,*sales_channel,*payment_collections"
  const url = `${BASE_URL}/admin/orders?fields=${fields}&limit=20&offset=0&order=-created_at`
  
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  console.log(`Full admin orders query status: ${res.status}`)
  
  if (res.status === 200) {
    const data = await res.json()
    console.log(`✅ Orders list returned ${data.orders?.length} orders, count=${data.count}`)
    data.orders?.slice(0, 5).forEach(o => {
      console.log(`  Order ${o.id}: status=${o.status}, payment_status=${o.payment_status}`)
    })
  } else {
    console.log("❌ Still failing:", await res.json())
  }

  // Also test the two previously-bad orders individually
  for (const orderId of ['order_01KWPX4YY9A0EK11BBE6NE96S7', 'order_01KWPWXAK5NVKY400RAS5C9BJE']) {
    const r = await fetch(`${BASE_URL}/admin/orders/${orderId}?fields=id,status,*payment_collections`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    console.log(`Individual order ${orderId}: ${r.status}`)
  }
}

verifyOrders().catch(console.error)
