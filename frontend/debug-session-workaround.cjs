const axios = require('axios');

async function debugSession() {
  const headers = {
    'x-publishable-api-key': 'pk_0fe0acedabe024a5796f8d25743f7bee8c2dedbda4289ff73a294feec410db1b',
    'Content-Type': 'application/json'
  };

  const cartId = "cart_01KTP3S6N65XBDCZC2JC6J13KS"; // From previous test

  try {
    console.log("Creating new payment collection...");
    const colRes = await axios.post(`http://localhost:9000/store/payment-collections`, { cart_id: cartId }, { headers });
    const payColId = colRes.data.payment_collection.id;
    console.log("Created Payment Collection:", payColId);

    console.log("Initiating session...");
    const res = await axios.post(`http://localhost:9000/store/payment-collections/${payColId}/payment-sessions`, {
      provider_id: "pp_stripe_stripe",
      data: {}
    }, { headers });
    console.log("SUCCESS!", res.data.payment_collection.payment_sessions[0].id);
  } catch (err) {
    console.log("FAILED:", err.response?.status);
    console.log(err.response?.data);
  }
}

debugSession();
