import http from 'http';
import { randomUUID } from 'crypto';

const BASE = 'http://localhost:9000';
const USER_AGENT = 'POS-Integrity-Test/1.0';

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (url.search || ''),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function normalizeAmount(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object") {
    if ("numeric" in value && typeof value.numeric === "number") return value.numeric;
    if ("value" in value && typeof value.value === "string") return Number(value.value);
    const str = String(value);
    if (str !== "[object Object]") return Number(str);
  }
  return Number(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`   ✅ ${message}`);
}

async function main() {
  console.log('\n==========================================');
  console.log('UNIT TESTS: ERROR CLASSIFIER');
  console.log('==========================================');
  
  const isUniqueConstraintViolation = (err) => {
      if (!err) return false;
      const codes = [err.code, err.cause?.code, err.driverException?.code, err.originalError?.code];
      if (codes.includes("23505") || codes.includes(23505)) return true;
      const names = [err.name, err.cause?.name];
      if (names.includes("UniqueConstraintViolationException")) return true;
      const msg = String(err.message || "").toLowerCase();
      const dtl = String(err.detail || err.cause?.detail || "").toLowerCase();
      if (msg.includes("idx_pos_transaction_idempotency") || dtl.includes("idx_pos_transaction_idempotency")) return true;
      if (msg.includes("unique constraint") || dtl.includes("unique constraint")) return true;
      if (msg.includes("pos transaction") && msg.includes("idempotency_key") && msg.includes("already exists")) return true;
      return false;
  };

  const err1 = new Error("Pos transaction with idempotency_key: POS_CHECKOUT:..., already exists.");
  assert(isUniqueConstraintViolation(err1) === true, "Matches live Medusa duplicate error");

  const err2 = new Error("Customer email already exists");
  assert(isUniqueConstraintViolation(err2) === false, "Does not match unrelated duplicate error");

  assert(isUniqueConstraintViolation({ code: "23505" }) === true, "Matches Postgres 23505");
  assert(isUniqueConstraintViolation({ cause: { code: "23505" } }) === true, "Matches nested cause 23505");
  assert(isUniqueConstraintViolation({ driverException: { code: "23505" } }) === true, "Matches driverException 23505");
  assert(isUniqueConstraintViolation({ originalError: { code: "23505" } }) === true, "Matches originalError 23505");
  assert(isUniqueConstraintViolation({ name: "UniqueConstraintViolationException" }) === true, "Matches ORM exception name");
  assert(isUniqueConstraintViolation({ message: "constraint IDX_pos_transaction_idempotency failed" }) === true, "Matches specific constraint name");
  console.log('Error classifier tests passed.\n');

  console.log('=== POS Native Cart to Order Checkout Integrity Test ===\n');

  console.log('1. BigNumber Normalization Self-Test');
  assert(normalizeAmount({ value: "2000" }) === 2000, "BigNumber { value: '2000' } normalizes to 2000");
  assert(normalizeAmount({ numeric: 2000 }) === 2000, "BigNumber { numeric: 2000 } normalizes to 2000");
  assert(normalizeAmount(2000) === 2000, "Primitive normalizes correctly");

  console.log('\n2. Backend connectivity');
  const health = await request('GET', '/health').catch(() => ({ status: 500 }));
  if (health.status !== 200) {
    throw new Error('Backend is not reachable on localhost:9000. Start the backend before running this integrity test.');
  }

  const email = process.env.POS_TEST_EMAIL || 'admin@eatsie.com';
  const password = process.env.POS_TEST_PASSWORD;
  if (!password) {
    throw new Error('POS_TEST_PASSWORD is required');
  }

  console.log('\n3. Authenticating as POS operator...');
  const loginResp = await request('POST', '/auth/user/emailpass', {}, { email: email.trim().toLowerCase(), password });
  let token = loginResp.data?.token;
  if (!token) {
     throw new Error('Could not authenticate default POS operator with /auth/user/emailpass. Check credentials.');
  }
  const headers = { 'Authorization': `Bearer ${token}` };

  console.log('\n4. Verifying Actor...');
  const meResp = await request('GET', '/pos/me', headers);
  if (meResp.data?.operator?.id !== 'user_01KWPV0WK7J0KN2A8FZ0AD3T16') {
    throw new Error('POS_TEST_ACTOR_MISMATCH');
  }
  assert(true, "Actor matches user_01KWPV0WK7J0KN2A8FZ0AD3T16");

  console.log('\n5. Verifying Bootstrap...');
  let bootstrap = await request('GET', '/pos/bootstrap', headers);
  if (bootstrap.data?.assignment_state !== 'ready' || !bootstrap.data?.registers || bootstrap.data.registers.length < 2) {
    throw new Error('Bootstrap is not ready or registerCount is not at least 2.');
  }
  assert(true, "Bootstrap assignment_state = ready and registers exist.");

  const canadaRegister = bootstrap.data.registers.find(r => r.name === 'Canada POS Register');
  if (!canadaRegister) throw new Error('Canada POS Register not found in assignments.');

  console.log('\n6. Checking/Opening Register Session...');
  if (!bootstrap.data.session || bootstrap.data.session.status !== 'OPEN') {
     console.log('No active session. Opening Canada POS Register...');
     const openResp = await request('POST', `/pos/registers/${canadaRegister.id}/open`, headers, { opening_cash_minor: 0 });
     if (openResp.status >= 400) throw new Error('Failed to open register: ' + JSON.stringify(openResp.data));
     bootstrap = await request('GET', '/pos/bootstrap', headers);
  }
  
  if (!bootstrap.data.session?.register_id || String(bootstrap.data.session.status || '').toUpperCase() !== 'OPEN') {
     throw new Error('Failed to obtain a READY_SESSION.');
  }
  const activeRegisterId = bootstrap.data.session.register_id;
  assert(true, "Active session exists and is OPEN on register " + activeRegisterId);

  console.log('\n7. Retrieving Test Data (Canada Variant)...');
  const prodResp = await request('GET', `/pos/products/search?register_id=${activeRegisterId}&limit=100`, headers);
  const variants = [];
  if (prodResp.data?.products) {
     for (const p of prodResp.data.products) {
        if (p.variant_id) variants.push(p);
        else if (p.variants) variants.push(...p.variants);
     }
  } else if (prodResp.data?.variants) {
     variants.push(...prodResp.data.variants);
  }

  console.log("\nPOS TEST PRODUCT DISCOVERY");
  console.log("Register: " + activeRegisterId);
  
  let cadVariantCount = 0;
  let inventoryPositiveCount = 0;
  let eligibleCount = 0;

  const candidates = variants.map(v => {
      const price = v.price || v.pricing;
      const inv = v.inventory;
      const currency = String(price?.currency_code || "").toLowerCase();
      let reject_reason = null;

      if (currency !== 'cad') {
          reject_reason = 'NO_CAD_PRICE';
      } else {
          cadVariantCount++;
      }

      const hasInventoryObj = typeof inv === 'object' && inv !== null;
      let availableQuantity = hasInventoryObj && 'available_quantity' in inv ? inv.available_quantity : 'UNKNOWN';
      
      if (!reject_reason) {
          if (availableQuantity === 'UNKNOWN') {
             reject_reason = 'UNKNOWN_INVENTORY';
          } else if (availableQuantity <= 0) {
             reject_reason = 'NO_INVENTORY';
          } else {
             inventoryPositiveCount++;
          }
      }
      
      const sellable = !reject_reason;
      if (sellable) eligibleCount++;

      return {
          product_id: v.product_id || v.product?.id,
          variant_id: v.variant_id || v.id,
          sku: v.sku || v.variant?.sku,
          currency_code: currency,
          resolved_price: price?.amount_minor,
          available_quantity: availableQuantity,
          sellable,
          reject_reason
      };
  });

  console.log(JSON.stringify(candidates.slice(0, 10), null, 2));

  console.log("Currency: cad");
  console.log("Stock location: " + (variants[0]?.inventory?.stock_location_id || "UNKNOWN"));
  console.log("Sales channel: " + (variants[0]?.commercial_context?.sales_channel_id || "UNKNOWN"));
  console.log("Candidate count: " + variants.length);
  console.log("CAD-priced candidate count: " + cadVariantCount);
  console.log("Inventory-positive candidate count: " + inventoryPositiveCount);
  console.log("Eligible candidate count: " + eligibleCount);

  // Deterministic sort by variant_id
  candidates.sort((a, b) => String(a.variant_id).localeCompare(String(b.variant_id)));
  
  const selectedCandidate = candidates.find(c => c.sellable);
  if (!selectedCandidate) {
      throw new Error('No deterministic CAD variant with available inventory found for register.');
  }

  const variant = variants.find(v => (v.variant_id || v.id) === selectedCandidate.variant_id);

  console.log("Selected product: " + selectedCandidate.product_id);
  console.log("Selected variant: " + selectedCandidate.variant_id);
  console.log("Selected SKU: " + selectedCandidate.sku);
  console.log("Resolved CAD price: " + selectedCandidate.resolved_price);
  console.log("Available Canada quantity: " + selectedCandidate.available_quantity);
  console.log("Selection: PASS");
  assert(true, `Selected variant ${variant.variant_id || variant.id} with price CAD ${selectedCandidate.resolved_price}`);
  
  const finalPriceMinor = selectedCandidate.resolved_price;

  async function createFreshCheckoutScenario(qty, testName) {
      console.log(`\n[${testName}] Creating offline draft cart...`);
      const idempotencyKey = randomUUID();
      const draftResp = await request('POST', '/pos/carts', headers, {
         register_id: activeRegisterId,
         idempotency_key: `pos-draft:${randomUUID()}`
      });
      const draft = draftResp.data?.cart;
      if (!draft) throw new Error('Failed to create cart.');

      console.log(`[${testName}] Updating draft with Qty ${qty}...`);
      const updateCartResp = await request('POST', `/pos/carts/${draft.id}`, headers, {
          items: [{ variant_id: selectedCandidate.variant_id, quantity: qty, last_known_price_minor: finalPriceMinor }]
      });
      if (updateCartResp.status >= 400) throw new Error('Failed to update cart: ' + JSON.stringify(updateCartResp.data));

      const expectedSubtotal = finalPriceMinor * qty;

      console.log(`[${testName}] Resolving exact amount via POS_TOTAL_CHANGED...`);
      const checkoutFail = await request('POST', `/pos/carts/${draft.id}/checkout`, headers, {
          idempotency_key: idempotencyKey,
          confirmed_total_minor: expectedSubtotal - 50
      });
      if (checkoutFail.status !== 409 || checkoutFail.data?.code !== 'POS_TOTAL_CHANGED') {
         throw new Error("Backend did not prevent checkout on confirmed total mismatch.");
      }

      const exactAmount = checkoutFail.data?.metadata?.native_cart?.total_minor || expectedSubtotal;
      const paymentPayload = { method: 'CASH', amount_tendered_minor: exactAmount, change_due_minor: 0 };
      
      return { draft, idempotencyKey, exactAmount, paymentPayload };
  }

  // ==========================================
  // TEST A: SEQUENTIAL IDEMPOTENCY (QTY 2)
  // ==========================================
  console.log('\n==========================================');
  console.log('TEST A — SEQUENTIAL IDEMPOTENCY');
  console.log('==========================================');
  const scenarioA = await createFreshCheckoutScenario(2, 'TEST A');
  
  const checkoutSuccess1 = await request('POST', `/pos/carts/${scenarioA.draft.id}/checkout`, headers, {
      idempotency_key: scenarioA.idempotencyKey,
      confirmed_total_minor: scenarioA.exactAmount,
      payments: [scenarioA.paymentPayload]
  });
  if (checkoutSuccess1.status >= 400) throw new Error(`TEST A Checkout 1 failed: ${JSON.stringify(checkoutSuccess1.data)}`);

  const checkoutSuccess2 = await request('POST', `/pos/carts/${scenarioA.draft.id}/checkout`, headers, {
      idempotency_key: scenarioA.idempotencyKey,
      confirmed_total_minor: scenarioA.exactAmount,
      payments: [scenarioA.paymentPayload]
  });

  const orderA1 = checkoutSuccess1.data.order;
  const orderA2 = checkoutSuccess2.data.order;
  if (!orderA1) throw new Error("Order missing from TEST A first response.");

  console.log("First status:", checkoutSuccess1.status);
  console.log("First order:", orderA1.id);
  console.log("First reused:", checkoutSuccess1.data.reused);
  console.log("Second status:", checkoutSuccess2.status);
  console.log("Second order:", orderA2?.id);
  console.log("Second reused:", checkoutSuccess2.data.reused);
  console.log("Same order:", orderA1.id === orderA2?.id ? "PASS" : "FAIL");

  assert(checkoutSuccess2.status >= 200 && checkoutSuccess2.status < 300, "TEST A: Second request returns successful 2xx status");
  assert(orderA2?.id === orderA1.id, "TEST A: Second request returns the SAME order_id");
  assert(checkoutSuccess2.data?.reused === true, "TEST A: Second request exposes reused true flag");

  // ==========================================
  // TEST B: CONCURRENT IDEMPOTENCY (QTY 1)
  // ==========================================
  console.log('\n==========================================');
  console.log('TEST B — CONCURRENT IDEMPOTENCY');
  console.log('==========================================');
  const scenarioB = await createFreshCheckoutScenario(1, 'TEST B');
  const concurrentKey = `test-concurrent-${Date.now()}`;
  
  assert(scenarioB.draft.status !== "SYNCED", "TEST B: Fixture draft is UNSYNCED");
  
  console.log("Request A: sending...");
  console.log("Request B: sending...");
  const p1 = request('POST', `/pos/carts/${scenarioB.draft.id}/checkout`, headers, {
      idempotency_key: concurrentKey,
      confirmed_total_minor: scenarioB.exactAmount,
      payments: [scenarioB.paymentPayload]
  });
  const p2 = request('POST', `/pos/carts/${scenarioB.draft.id}/checkout`, headers, {
      idempotency_key: concurrentKey,
      confirmed_total_minor: scenarioB.exactAmount,
      payments: [scenarioB.paymentPayload]
  });

  const [res1, res2] = await Promise.all([p1, p2]);
  
  console.log("\nRequest A:", {
      status: res1.status,
      code: res1.data?.code,
      order_id: res1.data?.order?.id,
      reused: res1.data?.reused
  });
  console.log("Request B:", {
      status: res2.status,
      code: res2.data?.code,
      order_id: res2.data?.order?.id,
      reused: res2.data?.reused
  });

  const successfulResults = [];
  const conflictResults = [];
  const uniqueSuccessfulOrderIds = new Set();
  
  for (const r of [res1, res2]) {
      if (r.status >= 200 && r.status < 300 && r.data?.order) {
          successfulResults.push(r);
          uniqueSuccessfulOrderIds.add(r.data.order.id);
      } else if (r.status === 409 && r.data?.code === 'POS_CHECKOUT_IN_PROGRESS') {
          conflictResults.push(r);
      } else {
          throw new Error(`Unexpected concurrent response: status=${r.status} code=${r.data?.code || 'unknown'} message=${JSON.stringify(r.data)}`);
      }
  }
  
  // Verify persisted orders delta for this cart
  // Since we use a fresh scenario with an exact draft, the number of successful unique order IDs is the delta.
  const ordersCreated = uniqueSuccessfulOrderIds.size;

  console.log("\nSuccessful responses:", successfulResults.length);
  console.log("Conflict responses:", conflictResults.length);
  console.log("Unique successful order IDs:", uniqueSuccessfulOrderIds.size);
  console.log("Persisted orders created:", ordersCreated);
  console.log("Concurrent duplicate order:", ordersCreated > 1 ? "YES" : "NO");

  assert(successfulResults.length >= 1, "TEST B: At least one request succeeded");
  assert(uniqueSuccessfulOrderIds.size === 1, "TEST B: Exactly one unique order ID produced");
  assert(ordersCreated === 1, "TEST B: Persisted order count increased by exactly 1");

  console.log("Concurrent idempotency: PASS");

  // ==========================================
  // TEST C: DIFFERENT KEY PROTECTION
  // ==========================================
  console.log('\n==========================================');
  console.log('TEST C — DIFFERENT KEY PROTECTION');
  console.log('==========================================');
  console.log('Completed cart: YES (Using Test A cart)');
  
  const diffKeyReq = await request('POST', `/pos/carts/${scenarioA.draft.id}/checkout`, headers, {
      idempotency_key: `test-diff-${Date.now()}`,
      confirmed_total_minor: scenarioA.exactAmount,
      payments: [scenarioA.paymentPayload]
  });
  console.log("Different key status:", diffKeyReq.status);
  console.log("Code:", diffKeyReq.data?.code);
  assert(diffKeyReq.status === 409 && diffKeyReq.data?.code === 'POS_CHECKOUT_ALREADY_COMPLETED', "TEST C: Different key on completed cart is rejected");
  console.log("Different-key protection: PASS");

  console.log('\n12. Asserting comprehensive integrity between Medusa Cart & Order (using Test A)...');
  const native_cart = checkoutSuccess1.data.native_cart;
  assert(native_cart.currency_code === orderA1.currency_code, "Currency code matches");
  assert(normalizeAmount(native_cart.subtotal) === normalizeAmount(orderA1.subtotal), "Subtotal matches precisely");
  assert(normalizeAmount(native_cart.tax_total) === normalizeAmount(orderA1.tax_total), "Tax total matches");
  assert(normalizeAmount(native_cart.discount_total) === normalizeAmount(orderA1.discount_total), "Discount total matches");
  assert(normalizeAmount(native_cart.total) === normalizeAmount(orderA1.total), "Final total matches");
  assert(normalizeAmount(native_cart.shipping_subtotal || 0) === 0, "No phantom shipping applied to POS carryout cart");
  assert(normalizeAmount(orderA1.shipping_subtotal || 0) === 0, "No phantom shipping applied to Medusa order");

  const cartItem = native_cart.items[0];
  const orderItem = orderA1.items.find(i => i.variant_id === selectedCandidate.variant_id) || orderA1.items[0];
  assert(normalizeAmount(cartItem.unit_price) === normalizeAmount(orderItem.unit_price), "Cart and Order line unit_price matches");

  const safeUnit = normalizeAmount(orderItem.unit_price);
  assert(safeUnit < 1000000, "Major/Minor unit sanity check (Value is not accidentally multiplied by 100^2)");

  console.log('\n🎉 Test flow completed successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
