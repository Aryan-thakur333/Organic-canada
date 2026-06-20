import axios from 'axios';

const API_URL = 'http://localhost:9000';

async function testRegistrationNoKey() {
  try {
    const response = await axios.post(`${API_URL}/store/customers`, {
      email: 'test' + Date.now() + '@example.com',
      password: 'password123',
      first_name: 'Test',
      last_name: 'User'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('Registration Success:', response.data);
  } catch (error) {
    console.error('Registration Failed:', error.response?.data || error.message);
  }
}

testRegistrationNoKey();
