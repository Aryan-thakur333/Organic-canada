import http from 'http';

const BASE = 'http://localhost:9000';
const PUBLISHABLE_KEY = 'pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491';

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': PUBLISHABLE_KEY,
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== B2B API Flow Test ===\n');

  // Step 1: Health check
  const health = await request('GET', '/health');
  console.log(`1. Health: ${health.status} - ${JSON.stringify(health.data)}\n`);

  // Step 2: Test /store/b2b/products without auth (expect 401)
  const noAuth = await request('GET', '/store/b2b/products');
  console.log(`2. /store/b2b/products without auth: ${noAuth.status}`);
  console.log(`   Response: ${JSON.stringify(noAuth.data)}\n`);

  // Step 3: Test /store/b2b/products with auth
  // Try to get a token from the backend test script's known customers
  const authRes = await request('POST', '/auth/customer/emailpass', {}, {
    email: 'customer@medusa-test.com',
    password: 'supersecret',
  });
  console.log(`3a. Auth attempt: ${authRes.status}`);
  console.log(`   Response: ${JSON.stringify(authRes.data)}\n`);

  // If auth succeeds, test the B2B products endpoint
  if (authRes.status === 200 && authRes.data?.token) {
    const token = authRes.data.token;
    console.log(`   Token received: ${token.substring(0, 20)}...\n`);

    const b2bRes = await request('GET', '/store/b2b/products', {
      'Authorization': `Bearer ${token}`,
    });
    console.log(`3b. /store/b2b/products with auth: ${b2bRes.status}`);
    
    if (b2bRes.status === 200) {
      const products = b2bRes.data?.products || b2bRes.data?.data?.products || [];
      console.log(`   Products count: ${products.length}`);
      console.log(`   Price list: ${JSON.stringify(b2bRes.data?.price_list)}`);
      console.log(`   Company: ${JSON.stringify(b2bRes.data?.company)}`);
      if (b2bRes.data?.debug) {
        console.log(`   Debug: ${JSON.stringify(b2bRes.data.debug)}`);
      }
      if (products.length > 0) {
        console.log(`   First product: ${products[0]?.title} (${products[0]?.id})`);
        console.log(`   First product variants: ${products[0]?.variants?.length || 0}`);
      }
    } else {
      console.log(`   Response: ${JSON.stringify(b2bRes.data)}`);
    }
  } else {
    // Try alternate credentials
    const authRes2 = await request('POST', '/auth/customer/emailpass', {}, {
      email: 'test@medusa-test.com',
      password: 'supersecret',
    });
    console.log(`3c. Auth attempt 2: ${authRes2.status}`);
    console.log(`   Response: ${JSON.stringify(authRes2.data)}\n`);

    if (authRes2.status === 200 && authRes2.data?.token) {
      const token = authRes2.data.token;
      const b2bRes = await request('GET', '/store/b2b/products', {
        'Authorization': `Bearer ${token}`,
      });
      console.log(`3d. /store/b2b/products with auth: ${b2bRes.status}`);
      if (b2bRes.status === 200) {
        const products = b2bRes.data?.products || b2bRes.data?.data?.products || [];
        console.log(`   Products count: ${products.length}`);
        console.log(`   Price list: ${JSON.stringify(b2bRes.data?.price_list)}`);
      } else {
        console.log(`   Response: ${JSON.stringify(b2bRes.data)}`);
      }
    } else {
      console.log('   Could not authenticate with known credentials');
      console.log('   Try to list available customers...');
      
      // Step 4: Check /store/b2b/company endpoint
      const companyRes = await request('GET', '/store/b2b/company');
      console.log(`\n4. /store/b2b/company (no auth): ${companyRes.status}`);
      console.log(`   Response: ${JSON.stringify(companyRes.data)}`);
    }
  }

  console.log('\n=== Test complete ===');
}

main().catch(console.error);