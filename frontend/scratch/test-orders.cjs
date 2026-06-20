const axios = require('axios');

async function testOrders() {
  try {
    // 1. Create a customer or login
    // we need to know the proper endpoints.
    const baseUrl = 'http://localhost:9000';
    console.log("No token available to test logged in user. Let's just check Medusa version and endpoint");
  } catch (err) {
    console.error(err);
  }
}
testOrders();
