const BASE_URL = 'http://localhost:9000';
const PUB_KEY  = 'pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491';
const PRODUCT_ID = 'prod_01KWQ08JHXBV4P7PMB7SXVDXAZ';

async function check() {
  const regRes = await fetch(`${BASE_URL}/store/regions`, {
    headers: { 'x-publishable-api-key': PUB_KEY }
  });
  const { regions } = await regRes.json();
  const regionId = regions?.[0]?.id;

  // Check total product count
  const countRes = await fetch(
    `${BASE_URL}/store/products?region_id=${regionId}&limit=1&fields=id`,
    { headers: { 'x-publishable-api-key': PUB_KEY } }
  );
  const { count } = await countRes.json();
  console.log(`Total store products: ${count}`);

  // Try fetching with higher limit
  const listRes = await fetch(
    `${BASE_URL}/store/products?region_id=${regionId}&limit=200&fields=id,title`,
    { headers: { 'x-publishable-api-key': PUB_KEY } }
  );
  const { products } = await listRes.json();
  console.log(`Products returned with limit=200: ${products?.length}`);
  const found = products?.find(p => p.id === PRODUCT_ID);
  console.log(`Product found: ${found ? '✅ YES - ' + found.title : '❌ NO'}`);

  // Check with order by created_at
  const newRes = await fetch(
    `${BASE_URL}/store/products?region_id=${regionId}&limit=5&order=-created_at&fields=id,title`,
    { headers: { 'x-publishable-api-key': PUB_KEY } }
  );
  const { products: newest } = await newRes.json();
  console.log('\nNewest 5 products in store:');
  for (const p of newest || []) {
    console.log(`  ${p.id === PRODUCT_ID ? '✅' : '  '} ${p.title} (${p.id})`);
  }
}
check().catch(e => { console.error(e.message); process.exit(1); });
