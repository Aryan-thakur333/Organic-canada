const axios = require('axios');

async function testCart() {
  const headers = {
    'x-publishable-api-key': 'pk_0fe0acedabe024a5796f8d25743f7bee8c2dedbda4289ff73a294feec410db1b',
    'Content-Type': 'application/json'
  };

  const cartId = "cart_01KTP57416HBS776077MB8VW54";

  try {
    const res = await axios.get(`http://localhost:9000/store/carts/${cartId}`, { headers });
    console.log("Cart currency:", res.data.cart.currency_code);
    console.log("Cart region currency:", res.data.cart.region?.currency_code);
  } catch (err) {
    console.log("FAILED:", err.response?.status);
    console.log(err.response?.data);
  }
}

testCart();
