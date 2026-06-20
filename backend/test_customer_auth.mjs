import fetch from 'node-fetch';

async function run() {
  const email = `test_${Date.now()}@example.com`;
  const password = 'Password123!';

  console.log('1. Trying to register in Auth service with email:', email);
  try {
    const authRegRes = await fetch('http://localhost:9000/auth/customer/emailpass/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    console.log('Status:', authRegRes.status);
    const authRegData = await authRegRes.json();
    console.log('Response data:', authRegData);

    if (!authRegRes.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(authRegData)}`);
    }

    const token = authRegData.token;
    console.log('2. Trying to create customer profile using token:', token);
    const custCreateRes = await fetch('http://localhost:9000/store/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-publishable-api-key': 'pk_0fe0acedabe024a5796f8d25743f7bee8c2dedbda4289ff73a294feec410db1b'
      },
      body: JSON.stringify({
        email,
        first_name: 'Test',
        last_name: 'User',
      }),
    });

    console.log('Status:', custCreateRes.status);
    const custCreateData = await custCreateRes.json();
    console.log('Response data:', custCreateData);
  } catch (error) {
    console.error('Error during test:', error);
  }
}

run();
