/**
 * Deep audit of the last 5 digital products - check variant, price, sales_channel
 */
const { Client } = require('pg');
const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:9426695327@localhost:5432/medusa-backend';
const BASE_URL = 'http://localhost:9000';

async function deepAudit() {
  const loginRes = await fetch(`${BASE_URL}/auth/user/emailpass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@eatsie.com', password: 'Password123!' }),
  });
  const { token } = await loginRes.json();

  // Fetch recent products with full detail from admin API
  const adminRes = await fetch(
    `${BASE_URL}/admin/products?limit=5&order=-created_at&fields=id,title,handle,status,metadata,type_id,sales_channels.*,variants.*,variants.prices.*`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { products } = await adminRes.json();
  
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  console.log('=== Deep Audit: Last 5 Products ===\n');
  for (const p of products || []) {
    console.log(`--- ${p.title} (${p.id}) ---`);
    console.log(`  status: ${p.status}`);
    console.log(`  handle: ${p.handle}`);
    console.log(`  sales_channels: ${JSON.stringify((p.sales_channels || []).map(sc => sc.id))}`);
    console.log(`  type_id: ${p.type_id}`);
    console.log(`  is_digital: ${p.metadata?.is_digital}`);
    console.log(`  requires_shipping: ${p.metadata?.requires_shipping}`);
    
    const variants = p.variants || [];
    console.log(`  variants (${variants.length}):`);
    for (const v of variants) {
      const prices = v.prices || [];
      console.log(`    variant: ${v.title} | sku=${v.sku} | manage_inventory=${v.manage_inventory} | allow_backorder=${v.allow_backorder}`);
      console.log(`    prices: ${JSON.stringify(prices.map(pr => ({ currency: pr.currency_code, amount: pr.amount })))}`);
      const cadPrice = prices.find(pr => pr.currency_code === 'cad');
      console.log(`    CAD price: ${cadPrice ? `${cadPrice.amount} cents` : '❌ MISSING'}`);
    }

    // Check product_sales_channel in DB
    const pscRes = await client.query(
      'SELECT * FROM product_sales_channel WHERE product_id = $1',
      [p.id]
    );
    console.log(`  DB product_sales_channel rows: ${pscRes.rows.length}`);
    
    // Check price_list / money_amount
    const priceRes = await client.query(`
      SELECT ma.id, ma.currency_code, ma.amount, pv.id as variant_id, pv.title as variant_title
      FROM money_amount ma
      JOIN price_set_money_amount psma ON psma.money_amount_id = ma.id
      JOIN price_set ps ON ps.id = psma.price_set_id
      JOIN variant_price_set vps ON vps.price_set_id = ps.id
      JOIN product_variant pv ON pv.id = vps.variant_id
      WHERE pv.product_id = $1
    `, [p.id]);
    console.log(`  DB money_amount rows: ${priceRes.rows.length}`);
    for (const pr of priceRes.rows) {
      console.log(`    ${pr.currency_code} ${pr.amount} (variant: ${pr.variant_title})`);
    }
    console.log();
  }

  // Check Default Sales Channel publishable key linkage
  const pubKeyRes = await client.query(`
    SELECT pak.token, pak.title, paksc.sales_channel_id
    FROM publishable_api_key pak
    LEFT JOIN publishable_api_key_sales_channel paksc ON paksc.publishable_api_key_id = pak.id
    LIMIT 5
  `);
  console.log('=== Publishable API Key → Sales Channel ===');
  for (const r of pubKeyRes.rows) {
    console.log(`  ${r.title}: sales_channel=${r.sales_channel_id}`);
  }

  await client.end();
}

deepAudit().catch(e => { console.error(e.message); process.exit(1); });
