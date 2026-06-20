import axios from 'axios';

const API_URL = 'http://localhost:9000';
const PUBLISHABLE_KEY = 'pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431';

async function testRegistration() {
  try {
    const response = await axios.post(`${API_URL}/store/customers`, {
      email: 'aryan@example.com',
      password: 'password123',
      first_name: 'Aryan',
      last_name: 'User'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': PUBLISHABLE_KEY
      }
    });
    console.log('Registration Success:', response.data);
  } catch (error) {
    console.error('Registration Failed:', error.response?.data || error.message);
  }
}

testRegistration();
