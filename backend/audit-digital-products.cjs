/**
 * Phase 1 Audit: checks the actual state of recently-created digital products.
 * Run with: node audit-digital-products.cjs
 */
const { Client } = require('pg');

const BASE_URL = 'http://localhost:9000';
const PUB_KEY  = 'pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491';
const DB_URL   = process.env.DATABASE_URL || 'postgres://postgres:9426695327@localhost:5432/medusa-backend';

async function audit() {
  // --- Admin login ---
  const loginRes = await fetch(`${BASE_URL}/auth/user/emailpass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@eatsie.com', password: 'Password123!' }),
  });
  const { token } = await loginRes.json();
  if (!token) { console.error('Admin login failed'); return; }
  console.log('✅ Admin logged in\n');

  // --- List last 10 admin products ---
  const adminListRes = await fetch(`${BASE_URL}/admin/products?limit=10&order=-created_at&fields=id,title,handle,status,metadata,type.*,sales_channels.*`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const adminList = await adminListRes.json();
  console.log('=== Last 10 Admin Products ===');
  for (const p of adminList.products || []) {
    const isMeta = p.metadata?.is_digital;
    const scCount = p.sales_channels?.length || 0;
    console.log(`  [${p.status}] ${p.title} | id=${p.id} | sc=${scCount} | is_digital=${isMeta}`);
  }

  // --- Find digital products specifically ---
  const digitalAdminRes = await fetch(
    `${BASE_URL}/admin/products?limit=50&fields=id,title,handle,status,metadata,type.*,sales_channels.*,variants.*,variants.prices.*`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const digitalAdmin = await digitalAdminRes.json();
  const digitalProducts = (digitalAdmin.products || []).filter(
    p => p.metadata?.is_digital === true || p.metadata?.is_digital === 'true' || p.type?.value === 'Digital Product'
  );
  console.log(`\n=== Digital Products in Admin (${digitalProducts.length} found) ===`);
  for (const p of digitalProducts) {
    const cadPrice = (p.variants || []).flatMap(v => v.prices || []).find(pr => pr.currency_code === 'cad');
    const scIds = (p.sales_channels || []).map(sc => sc.id);
    console.log(`  Title: ${p.title}`);
    console.log(`    id=${p.id} | handle=${p.handle} | status=${p.status}`);
    console.log(`    sales_channels: [${scIds.join(', ')}]`);
    console.log(`    variant_count=${p.variants?.length || 0}`);
    console.log(`    CAD price: ${cadPrice ? (cadPrice.amount / 100).toFixed(2) + ' CAD' : '❌ MISSING'}`);
    console.log(`    is_digital=${p.metadata?.is_digital} | requires_shipping=${p.metadata?.requires_shipping}`);
    console.log(`    download_assets=${JSON.stringify(p.metadata?.download_assets || []).slice(0, 80)}`);
    console.log();
  }

  // --- Resolve active region ---
  const regionsRes = await fetch(`${BASE_URL}/store/regions`, {
    headers: { 'x-publishable-api-key': PUB_KEY }
  });
  const { regions } = await regionsRes.json();
  const region = regions?.[0];
  console.log(`=== Active Region: ${region?.name} (${region?.id}) currency=${region?.currency_code} ===\n`);

  // --- Store API check ---
  const storeRes = await fetch(
    `${BASE_URL}/store/products?limit=100&region_id=${region?.id}&fields=id,title,handle,status,metadata,type.*,variants.*,variants.calculated_price.*`,
    { headers: { 'x-publishable-api-key': PUB_KEY } }
  );
  const storeData = await storeRes.json();
  const storeDigital = (storeData.products || []).filter(
    p => p.metadata?.is_digital === true || p.metadata?.is_digital === 'true' || p.type?.value === 'Digital Product'
  );
  console.log(`=== Store API Digital Products (${storeDigital.length} of ${storeData.products?.length || 0} total) ===`);
  for (const p of storeDigital) {
    const calcPrice = p.variants?.[0]?.calculated_price;
    console.log(`  ${p.title} | status=${p.status} | calculated_price=${calcPrice?.calculated_amount ?? 'null'} ${calcPrice?.currency_code ?? ''}`);
  }

  // --- DB check: products created in last 2 hours with is_digital metadata ---
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  const dbRes = await client.query(`
    SELECT id, title, handle, status, metadata, created_at
    FROM product
    WHERE created_at > NOW() - INTERVAL '2 hours'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log(`\n=== DB: Products created in last 2 hours (${dbRes.rows.length}) ===`);
  for (const r of dbRes.rows) {
    console.log(`  ${r.title} | id=${r.id} | status=${r.status} | is_digital=${r.metadata?.is_digital}`);
  }

  // Check Default Sales Channel ID
  const scRes = await client.query(`
    SELECT id, name, is_disabled FROM sales_channel ORDER BY created_at ASC LIMIT 5
  `);
  console.log('\n=== Sales Channels ===');
  for (const sc of scRes.rows) {
    console.log(`  ${sc.name} | id=${sc.id} | disabled=${sc.is_disabled}`);
  }

  // Check product_sales_channel for digital products
  if (digitalProducts.length > 0) {
    for (const dp of digitalProducts.slice(0, 3)) {
      const pscRes = await client.query(
        `SELECT * FROM product_sales_channel WHERE product_id = $1`,
        [dp.id]
      );
      console.log(`\n  product_sales_channel for ${dp.title}: ${pscRes.rows.length} entries`);
      for (const r of pscRes.rows) console.log(`    ${JSON.stringify(r)}`);
    }
  }

  await client.end();
  console.log('\n✅ Audit complete.');
}

audit().catch(e => { console.error(e.message); process.exit(1); });
