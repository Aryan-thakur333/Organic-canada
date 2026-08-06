/**
 * End-to-end test: Create a digital product via the admin API,
 * then verify it appears in the store API.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const BASE_URL = 'http://localhost:9000';
const PUB_KEY  = 'pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491';

async function e2eTest() {
  // 1. Admin login
  const loginRes = await fetch(`${BASE_URL}/auth/user/emailpass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@eatsie.com', password: 'Password123!' }),
  });
  const { token } = await loginRes.json();
  if (!token) { console.error('❌ Admin login failed'); return; }
  console.log('✅ Admin login OK');

  // 2. Create a tiny test PDF file in the OS temp dir (not in watched backend root)
  const testPdfPath = path.join(os.tmpdir(), `_test-digital-${Date.now()}.pdf`);
  fs.writeFileSync(testPdfPath, '%PDF-1.4 test digital content');

  const title = `E2E Digital Book ${Date.now()}`;
  const form = new FormData();
  const blob = new Blob([fs.readFileSync(testPdfPath)], { type: 'application/pdf' });
  form.append('file', blob, '_test-digital.pdf');
  form.append('title', title);
  form.append('description', 'End-to-end test digital product');
  form.append('prices', JSON.stringify([{ currency_code: 'cad', amount: '78' }]));
  form.append('version', '1.0.0');
  form.append('download_limit', '5');
  form.append('download_expiry_days', '365');
  form.append('license_required', 'false');

  console.log(`\n📤 Creating digital product: "${title}"`);
  const createRes = await fetch(`${BASE_URL}/admin/products/digital`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const createData = await createRes.json();
  console.log(`Create status: ${createRes.status}`);
  
  if (!createRes.ok) {
    console.error('❌ Product creation failed:', createData);
    return;
  }

  const debug = createData.debug || {};
  console.log('\n📋 Debug block from creation:');
  console.log(`  product_id: ${debug.product_id}`);
  console.log(`  status: ${debug.status}`);
  console.log(`  sales_channel_linked: ${debug.sales_channel_linked}`);
  console.log(`  variant_count: ${debug.variant_count}`);
  console.log(`  cad_price_found: ${debug.cad_price_found} (${debug.cad_price_amount_cents} cents)`);
  console.log(`  metadata_is_digital: ${debug.metadata_is_digital}`);
  console.log(`  download_assets_count: ${debug.download_assets_count}`);

  const productId = debug.product_id;

  // 3. Verify in Admin API
  const adminCheckRes = await fetch(
    `${BASE_URL}/admin/products/${productId}?fields=id,title,status,sales_channels.*,variants.*,variants.prices.*,metadata`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { product: adminProduct } = await adminCheckRes.json();
  console.log('\n🔍 Admin API verification:');
  console.log(`  ✅ status=${adminProduct?.status}`);
  const scCount = adminProduct?.sales_channels?.length || 0;
  console.log(`  ${scCount > 0 ? '✅' : '❌'} sales_channels=${scCount}`);
  const cadPrice = (adminProduct?.variants || []).flatMap(v => v.prices || []).find(p => p.currency_code === 'cad');
  console.log(`  ${cadPrice ? '✅' : '❌'} CAD price=${cadPrice ? cadPrice.amount + ' cents' : 'MISSING'}`);
  console.log(`  ${adminProduct?.metadata?.is_digital ? '✅' : '❌'} metadata.is_digital=${adminProduct?.metadata?.is_digital}`);

  // 4. Verify in Store API
  const regRes = await fetch(`${BASE_URL}/store/regions`, { headers: { 'x-publishable-api-key': PUB_KEY } });
  const { regions } = await regRes.json();
  const regionId = regions?.[0]?.id;

  await new Promise(r => setTimeout(r, 1000)); // Brief wait for propagation
  
  const storeCheckRes = await fetch(
    `${BASE_URL}/store/products/${productId}?region_id=${regionId}&fields=id,title,status,variants.*,variants.calculated_price.*`,
    { headers: { 'x-publishable-api-key': PUB_KEY } }
  );
  
  console.log('\n🌐 Store API verification:');
  if (storeCheckRes.status === 200) {
    const { product: sp } = await storeCheckRes.json();
    const calcPrice = sp?.variants?.[0]?.calculated_price;
    console.log(`  ✅ Product visible in store API`);
    console.log(`  ${calcPrice?.calculated_amount ? '✅' : '⚠️'} calculated_price=${calcPrice?.calculated_amount ?? 'null'} ${calcPrice?.currency_code ?? ''}`);
  } else {
    console.log(`  ❌ Product NOT in store API (status ${storeCheckRes.status})`);
  }

  // 5. Check store /store/products list includes it
  const storeListRes = await fetch(
    `${BASE_URL}/store/products?region_id=${regionId}&limit=100&order=-created_at&fields=id,title,metadata`,
    { headers: { 'x-publishable-api-key': PUB_KEY } }
  );
  const { products: storeList } = await storeListRes.json();
  const found = storeList?.find(p => p.id === productId);
  console.log(`  ${found ? '✅' : '❌'} Product ${found ? 'FOUND' : 'NOT FOUND'} in /store/products list`);

  // Cleanup
  fs.unlinkSync(testPdfPath);
  
  console.log('\n============================');
  console.log((scCount > 0) && debug.cad_price_found && debug.metadata_is_digital && found
    ? '✅ ALL CHECKS PASSED — Product creation & visibility working correctly!'
    : '⚠️  Some checks failed — see above for details'
  );
}

e2eTest().catch(e => { console.error(e.message, e.stack); process.exit(1); });
