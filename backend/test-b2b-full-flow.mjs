import http from 'http';

const BASE = 'http://localhost:9000';
const PUBLISHABLE_KEY = 'pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491';
const USER_AGENT = 'B2B-Test/1.0';

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (url.search || ''),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== B2B Full Flow Test ===\n');

  // 1. Health check
  const health = await request('GET', '/health');
  console.log(`✅ Health: ${health.status}`);
  if (health.status !== 200) { console.log('❌ Backend not healthy'); process.exit(1); }

  // 2. Create a test customer and login
  const testEmail = `b2b_test_${Date.now()}@example.com`;
  const testPassword = 'TestPass123!';
  
  console.log(`\n📝 Creating test customer: ${testEmail}`);
  
  // Register auth identity
  const registerAuth = await request('POST', '/auth/customer/emailpass/register', {}, {
    email: testEmail,
    password: testPassword,
  });
  console.log(`   Register auth: ${registerAuth.status}`);
  
  let token;
  if (registerAuth.status === 200 && registerAuth.data?.token) {
    token = registerAuth.data.token;
  } else {
    // Try to login instead (might already exist)
    const loginResp = await request('POST', '/auth/customer/emailpass', {}, {
      email: testEmail,
      password: testPassword,
    });
    console.log(`   Login auth: ${loginResp.status}`);
    if (loginResp.status === 200 && loginResp.data?.token) {
      token = loginResp.data.token;
    } else {
      console.log('   Using known credentials...');
      // Try common test credentials
      const knownLogins = [
        { email: 'admin@medusa-test.com', password: 'supersecret' },
        { email: 'test@example.com', password: 'Password123!' },
      ];
      for (const creds of knownLogins) {
        const kr = await request('POST', '/auth/customer/emailpass', {}, creds);
        if (kr.status === 200 && kr.data?.token) {
          token = kr.data.token;
          console.log(`   Logged in as ${creds.email}`);
          break;
        }
      }
    }
  }

  // Registration token is auth identity token, need to create customer profile then re-login
  console.log('   Creating customer profile...');
  const createCustomer = await request('POST', '/store/customers', {
    'Authorization': `Bearer ${token}`,
  }, {
    email: testEmail,
    first_name: 'B2B',
    last_name: 'Test',
  });
  console.log(`   Create customer: ${createCustomer.status}`);
  
  // Now login to get customer-scoped token
  const loginResp = await request('POST', '/auth/customer/emailpass', {}, {
    email: testEmail,
    password: testPassword,
  });
  console.log(`   Login: ${loginResp.status}`);
  if (loginResp.status === 200 && loginResp.data?.token) {
    token = loginResp.data.token;
    console.log(`   Customer-scoped token obtained`);
  }

  if (!token) {
    console.log('\n❌ Could not obtain auth token');
    console.log('   Manual test: Login via browser on port 5174, then check Network tab');
    process.exit(1);
  }

  console.log(`\n🔑 Token obtained: ${token.substring(0, 20)}...`);

  // 3. Test /store/customers/me with token
  const me = await request('GET', '/store/customers/me', {
    'Authorization': `Bearer ${token}`,
  });
  console.log(`\n👤 /store/customers/me: ${me.status}`);
  console.log(`   Customer: ${me.data?.customer?.id} ${me.data?.customer?.email}`);

  // 4. Test /store/b2b/company
  const company = await request('GET', '/store/b2b/company', {
    'Authorization': `Bearer ${token}`,
  });
  console.log(`\n🏢 /store/b2b/company: ${company.status}`);
  console.log(`   Company: ${JSON.stringify(company.data?.company?.company_name || company.data?.company)}`);
  console.log(`   Status: ${company.data?.company?.status}`);

  // If no company, register one
  let companyId = company.data?.company?.id;
  if (!companyId && company.status === 200) {
    console.log('\n📋 Registering B2B company...');
    const register = await request('POST', '/store/b2b/company', {
      'Authorization': `Bearer ${token}`,
    }, {
      company_name: 'B2B Test Company',
      tax_id: 'TAX123',
    });
    console.log(`   Register company: ${register.status}`);
    console.log(`   Response: ${JSON.stringify(register.data?.company?.company_name || register.data)}`);
    companyId = register.data?.company?.id;
  }

  // 5. Test /store/b2b/products with auth
  console.log(`\n📦 Testing /store/b2b/products with auth...`);
  const b2bProducts = await request('GET', '/store/b2b/products?currency_code=cad&limit=100', {
    'Authorization': `Bearer ${token}`,
  });
  console.log(`   Status: ${b2bProducts.status}`);
  
  if (b2bProducts.status === 401) {
    console.log(`   ❌ 401 Unauthorized - Token may be invalid`);
    console.log(`   Response: ${JSON.stringify(b2bProducts.data)}`);
  } else if (b2bProducts.status === 403) {
    console.log(`   ❌ 403 Forbidden - Company not approved`);
    console.log(`   Response: ${JSON.stringify(b2bProducts.data)}`);
  } else if (b2bProducts.status === 500) {
    console.log(`   ❌ 500 Server Error`);
    console.log(`   Response: ${JSON.stringify(b2bProducts.data)}`);
  } else if (b2bProducts.status === 200) {
    const responseData = b2bProducts.data;
    const products = responseData?.products || responseData?.data?.products || [];
    console.log(`   ✅ Products count: ${products.length}`);
    console.log(`   Price list: ${JSON.stringify(responseData?.price_list)}`);
    console.log(`   Company: ${JSON.stringify(responseData?.company)}`);
    if (responseData?.debug) {
      console.log(`   Debug: ${JSON.stringify(responseData.debug)}`);
    }
    if (products.length > 0) {
      const first = products[0];
      console.log(`\n   First product: "${first?.title}" (${first?.id})`);
      console.log(`   Variants: ${first?.variants?.length || 0}`);
      if (first?.variants?.[0]) {
        console.log(`   First variant price: ${JSON.stringify(first.variants[0].calculated_price)}`);
        console.log(`   B2B price: ${first.variants[0].b2b_price}`);
        console.log(`   Original price: ${first.variants[0].original_price}`);
      }
    }
  } else {
    console.log(`   ❌ Unknown status: ${b2bProducts.status}`);
    console.log(`   Response: ${JSON.stringify(b2bProducts.data).substring(0, 500)}`);
  }

  console.log('\n=== Test Complete ===');
  
  if (b2bProducts.status === 200) {
    const pCount = (b2bProducts.data?.products || []).length;
    console.log(`\n🎯 RESULT: /store/b2b/products returned ${pCount} products`);
    console.log(`   Price list title: ${b2bProducts.data?.price_list?.title}`);
    console.log(`   Authorization: ✅ Token sent`);
    console.log(`   Publishable key: ✅ Sent`);
  } else {
    console.log(`\n⚠️  /store/b2b/products returned status ${b2bProducts.status}`);
    console.log(`   Check the response above for details`);
  }
}

main().catch(console.error);