const axios = require('axios');

async function testComplete() {
  const url = "http://localhost:9000/store/carts/cart_01KTP3S6N65XBDCZC2JC6J13KS/complete";
  const headers = {
    'x-publishable-api-key': 'pk_0fe0acedabe024a5796f8d25743f7bee8c2dedbda4289ff73a294feec410db1b',
    'Content-Type': 'application/json'
  };

  try {
    const res = await axios.post(url, {}, { headers });
    console.log("SUCCESS!", res.data.type);
    if (res.data.type === 'order') {
      console.log("Order ID:", res.data.order.id);
    }
  } catch (err) {
    console.log("FAILED with status:", err.response?.status);
    console.log("Error details:", err.response?.data);
  }
}

testComplete();
