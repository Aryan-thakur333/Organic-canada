import axios from 'axios';
import fs from 'fs';

async function testFetchOrders() {
  const apiClient = axios.create({
    baseURL: 'http://localhost:9000',
    headers: {
      'Content-Type': 'application/json',
      'x-publishable-api-key': process.env.VITE_MEDUSA_PUBLISHABLE_KEY || 'pk_9ec2a2169600e16790a38cc4fc828cd37b02c8928ee988cf73160e1dc32f3e58'
    }
  });

  try {
    // 1. Register/Login to get a token
    const loginRes = await apiClient.post('/auth/customer/emailpass?returnAccessToken=true', {
      email: 'unforgetable523566@gmail.com',
      password: 'password123'
    });
    
    const token = loginRes.data.access_token || loginRes.data.token;
    console.log("Logged in. Token:", token.substring(0, 10) + '...');
    
    apiClient.defaults.headers['Authorization'] = `Bearer ${token}`;
    
    // 2. Fetch profile to get customer ID
    const profileRes = await apiClient.get('/store/customers/me');
    console.log("Customer ID:", profileRes.data.customer.id);

    // 3. Fetch orders
    const ordersRes = await apiClient.get(
      '/store/orders?limit=20&fields=id,status,display_id,total,created_at,email,customer_id,cart_id,sales_channel_id,payment_status,fulfillment_status,*items,*fulfillments'
    );
    console.log("Orders count:", ordersRes.data?.orders?.length);
    console.log("Orders IDs:", ordersRes.data?.orders?.map(o => o.id));
    
  } catch (err) {
    console.error("Error:", err.response?.status, err.response?.data || err.message);
  }
}

testFetchOrders();
