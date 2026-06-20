const axios = require('axios');

async function testCart() {
  const headers = {
    'x-publishable-api-key': 'pk_0fe0acedabe024a5796f8d25743f7bee8c2dedbda4289ff73a294feec410db1b',
    'Content-Type': 'application/json'
  };

  const cartId = "cart_01KTP59ATA2KA900X1R1X8M5RF"; // Provided by the user

  try {
    const res = await axios.get(`http://localhost:9000/store/carts/${cartId}`, { headers });
    console.log("Cart Payment Collection:", res.data.cart.payment_collection);
    if (res.data.cart.payment_collection) {
        console.log("Sessions:", res.data.cart.payment_collection.payment_sessions);
    }
  } catch (err) {
    console.log("FAILED:", err.response?.status);
  }
}

testCart();
