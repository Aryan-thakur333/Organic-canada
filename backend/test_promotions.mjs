import fetch from 'node-fetch';
async function run() {
  const pk = 'pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431';
  console.log('Fetching regions...');
  const { regions } = await fetch('http://localhost:9000/store/regions', { headers: { 'x-publishable-api-key': pk } }).then(r => r.json());
  const regionId = regions[0].id;
  console.log('Creating cart...');
  const { cart } = await fetch('http://localhost:9000/store/carts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-publishable-api-key': pk }, body: JSON.stringify({ region_id: regionId }) }).then(r => r.json());
  console.log('Cart ID:', cart.id);
  
  console.log('Adding promo...');
  const res1 = await fetch('http://localhost:9000/store/carts/' + cart.id + '/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-publishable-api-key': pk }, body: JSON.stringify({ promo_codes: ['TESTPROMO'] }) }).then(r => r.json());
  console.log('Promo Add (POST /promotions):', JSON.stringify(res1));

  console.log('Adding promo old way...');
  const res2 = await fetch('http://localhost:9000/store/carts/' + cart.id, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-publishable-api-key': pk }, body: JSON.stringify({ promo_codes: ['TESTPROMO'] }) }).then(r => r.json());
  console.log('Promo Add (POST /):', JSON.stringify(res2));
}
run();
