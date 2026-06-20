const axios = require('axios');

async function testShippingOptions() {
  const headers = {
    'x-publishable-api-key': 'pk_0fe0acedabe024a5796f8d25743f7bee8c2dedbda4289ff73a294feec410db1b',
    'Content-Type': 'application/json'
  };

  const cartId = "cart_01KTP57416HBS776077MB8VW54";

  try {
    console.log("Fetching shipping options for cart:", cartId);
    const res = await axios.get(`http://localhost:9000/store/shipping-options?cart_id=${cartId}`, { headers });
    console.log("Found shipping options:", res.data.shipping_options.length);
    console.log(JSON.stringify(res.data.shipping_options, null, 2));
  } catch (err) {
    console.log("FAILED:", err.response?.status);
    console.log(err.response?.data);
  }
}

testShippingOptions();
