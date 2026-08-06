const { Client } = require('pg');
const DB_URL  = 'postgres://postgres:9426695327@localhost:5432/medusa-backend';
const BASE_URL = 'http://localhost:9000';
const PUB_KEY  = 'pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491';

async function checkStore() {
  const loginRes = await fetch(`${BASE_URL}/auth/user/emailpass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@eatsie.com', password: 'Password123!' }),
  });
  const { token } = await loginRes.json();
  console.log('✅ Admin logged in');

  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // Publishable API key linkage
  const pakRes = await client.query(`
    SELECT ak.id, ak.title, ak.token, paksc.sales_channel_id
    FROM api_key ak
    LEFT JOIN publishable_api_key_sales_channel paksc ON paksc.publishable_key_id = ak.id
    WHERE ak.type = 'publishable'
  `);
  console.log('\n=== Publishable API Keys → Sales Channels ===');
  for (const r of pakRes.rows) {
    const tokenMatch = r.token === PUB_KEY ? '✅ MATCHES' : '⚠️ differs';
    console.log(`  ${r.title}: sc=${r.sales_channel_id} | token ${tokenMatch}`);
  }

  const regionRes = await fetch(`${BASE_URL}/store/regions`, {
    headers: { 'x-publishable-api-key': PUB_KEY }
  });
  const { regions } = await regionRes.json();
  const region = regions?.[0];
  console.log(`\nActive Region: ${region?.name} (${region?.id}) currency=${region?.currency_code}`);

  // Get the 5 most recent products (admin)
  const adminRes = await fetch(
    `${BASE_URL}/admin/products?limit=5&order=-created_at&fields=id,title,handle,status`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { products: adminProducts } = await adminRes.json();

  console.log('\n=== Per-product store visibility check ===');
  for (const ap of adminProducts || []) {
    const r = await fetch(
      `${BASE_URL}/store/products/${ap.id}?region_id=${region?.id}&fields=id,title,status,variants.*,variants.calculated_price.*`,
      { headers: { 'x-publishable-api-key': PUB_KEY } }
    );
    if (r.status === 404) {
      console.log(`  ❌ ${ap.title} → 404 NOT IN STORE API`);
    } else if (r.status === 200) {
      const { product: sp } = await r.json();
      const calcPrice = sp?.variants?.[0]?.calculated_price;
      const calcAmt = calcPrice?.calculated_amount ?? 'null';
      const calcCurr = calcPrice?.currency_code ?? '—';
      const icon = calcAmt !== 'null' ? '✅' : '⚠️';
      console.log(`  ${icon} ${ap.title} → calc_price=${calcAmt} ${calcCurr} | status=${sp?.status}`);
    } else {
      console.log(`  ⚠️  ${ap.title} → HTTP ${r.status}`);
    }
  }

  // Price table entries for recent 5 products
  console.log('\n=== Price table entries (recent 5 products) ===');
  for (const ap of adminProducts || []) {
    const prRes = await client.query(`
      SELECT pv.title as variant_title, pr.currency_code, pr.amount, pr.raw_amount
      FROM product_variant pv
      JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
      JOIN price_set ps ON ps.id = pvps.price_set_id
      JOIN price pr ON pr.price_set_id = ps.id
      WHERE pv.product_id = $1
    `, [ap.id]);
    const icon = prRes.rows.some(r => r.currency_code === 'cad') ? '✅' : '❌';
    console.log(`  ${icon} ${ap.title}: ${prRes.rows.length} price rows`);
    for (const r of prRes.rows) {
      console.log(`      ${r.currency_code} = ${r.amount}`);
    }
  }

  await client.end();
}

checkStore().catch(e => { console.error(e.message); process.exit(1); });
