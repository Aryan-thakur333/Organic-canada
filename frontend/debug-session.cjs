const axios = require('axios');

async function debugSession() {
  const headers = {
    'x-publishable-api-key': 'pk_0fe0acedabe024a5796f8d25743f7bee8c2dedbda4289ff73a294feec410db1b',
    'Content-Type': 'application/json'
  };

  const payColId = "pay_col_01KTP4DJY0SDMH9QKFE3YMT0ZV";

  try {
    const res = await axios.post(`http://localhost:9000/store/payment-collections/${payColId}/payment-sessions`, {
      provider_id: "pp_stripe_stripe",
      data: {}
    }, { headers });
    console.log("SUCCESS!", res.data);
  } catch (err) {
    console.log("FAILED:", err.response?.status);
    console.log(err.response?.data);
  }
}

debugSession();
