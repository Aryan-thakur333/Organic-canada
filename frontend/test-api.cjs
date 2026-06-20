const axios = require('axios');

async function test() {
  const url = "http://localhost:9000/store/carts/cart_01KTP3S6N65XBDCZC2JC6J13KS/line-items";
  const headers = {
    'x-publishable-api-key': 'pk_0fe0acedabe024a5796f8d25743f7bee8c2dedbda4289ff73a294feec410db1b',
    'Content-Type': 'application/json'
  };

  const fields = "items.*,region.*,items.variant.*,items.variant.product.*,shipping_methods.*,payment_collection.*,payment_collection.payment_sessions.*,promotions.*";
  
  try {
    console.log("Testing with old fields...");
    await axios.post(`${url}?fields=${fields}`, {
      variant_id: "variant_01KT9DT7X1HA1DEYJW2YEXZPW0",
      quantity: 1
    }, { headers });
    console.log("SUCCESS!");
  } catch (err) {
    console.log("FAILED with status:", err.response?.status);
    console.log("Error details:", err.response?.data);
  }

  const newFields = "*items,*items.variant,*items.variant.product,*region,*shipping_methods,*payment_collection,*payment_collection.payment_sessions,*promotions";
  try {
    console.log("\nTesting with new fields...");
    await axios.post(`${url}?fields=${newFields}`, {
      variant_id: "variant_01KT9DT7X1HA1DEYJW2YEXZPW0",
      quantity: 1
    }, { headers });
    console.log("SUCCESS!");
  } catch (err) {
    console.log("FAILED with status:", err.response?.status);
    console.log("Error details:", err.response?.data);
  }
}

test();
