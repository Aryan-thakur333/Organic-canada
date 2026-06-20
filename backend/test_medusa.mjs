async function run() {
  const publishableKey = "pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431";
  const headers = { "x-publishable-api-key": publishableKey, "Content-Type": "application/json" };

  const cartRes = await fetch("http://localhost:9000/store/carts", { method: "POST", headers, body: JSON.stringify({}) });
  const cartId = (await cartRes.json()).cart.id;

  const variantId = "variant_01KRKBBFAFQF7B8BYF6857XRTQ"; // icecream

  const fields1 = "id,*items,*items.variant";
  const url1 = `http://localhost:9000/store/carts/${cartId}/line-items?fields=${encodeURIComponent(fields1)}`;
  const res1 = await fetch(url1, { method: "POST", headers, body: JSON.stringify({ variant_id: variantId, quantity: 1 }) });
  console.log("Status:", res1.status);
  console.log("Error body:", await res1.text());
}
run();
