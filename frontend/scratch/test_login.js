import axios from 'axios';

const API_URL = 'http://localhost:9000';
const PUBLISHABLE_KEY = 'pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431';

async function testLogin() {
  try {
    const response = await axios.post(`${API_URL}/auth/customer/emailpass`, {
      identifier: 'test@example.com',
      password: 'password123'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': PUBLISHABLE_KEY
      }
    });
    console.log('Login Success:', response.data);
  } catch (error) {
    console.error('Login Failed:', error.response?.data || error.message);
  }
}

testLogin();
