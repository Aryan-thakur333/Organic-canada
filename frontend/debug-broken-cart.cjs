const axios = require('axios');

async function debugBrokenCart() {
  const headers = {
    'x-publishable-api-key': 'pk_0fe0acedabe024a5796f8d25743f7bee8c2dedbda4289ff73a294feec410db1b',
    'Content-Type': 'application/json'
  };

  const cartId = "cart_01KTP59ATA2KA900X1R1X8M5RF"; // Broken cart from user

  try {
    console.log("Getting payment collection for cart...");
    const colRes = await axios.post(`http://localhost:9000/store/payment-collections`, { cart_id: cartId }, { headers });
    const payColId = colRes.data.payment_collection.id;
    console.log("Payment Collection:", payColId);

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

debugBrokenCart();
