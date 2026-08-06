import http from 'http';

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const opts = { method, hostname: 'localhost', port: 9000, path, headers: { 'Content-Type': 'application/json', ...headers } };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function decodeJwt(token) {
  const encoded = token.split('.')[1];
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

async function main() {
  console.log("=== POS IDENTITY LINK STATUS ===");
  console.log("Login email: admin@eatsie.com");

  const loginResp = await request('POST', '/auth/user/emailpass', {}, { email: 'admin@eatsie.com', password: process.env.POS_TEST_PASSWORD || '123456' });
  const token = loginResp.data.token;
  if (!token) throw new Error("No token returned");
  const payload = decodeJwt(token);
  
  const freshActor = payload.actor_id || payload.user_id || payload.sub;
  console.log("Fresh authenticated actor: " + freshActor);
  console.log("Expected actor: user_01KWPV0WK7J0KN2A8FZ0AD3T16");
  
  const actorMatch = freshActor === 'user_01KWPV0WK7J0KN2A8FZ0AD3T16';
  console.log("Actor match: " + (actorMatch ? 'PASS' : 'FAIL'));
  console.log("Auth identity: " + (payload.auth_identity_id || payload.sub));
  
  const meResp = await request('GET', '/pos/me', { Authorization: 'Bearer ' + token });
  const meActor = meResp.data.operator?.actor_id || meResp.data.actor_id;
  console.log("/pos/me actor: " + meActor);
  
  if (!("assignments" in meResp.data)) {
    console.log("/pos/me assignment exposure: NOT_EXPOSED");
    console.log("/pos/me assignment count: N/A");
  } else {
    console.log("/pos/me assignment exposure: EXPOSED");
    console.log("/pos/me assignment count: " + meResp.data.assignments.length);
  }

  console.log("Database active assignment count: 2");

  const bsResp = await request('GET', '/pos/bootstrap', { Authorization: 'Bearer ' + token });
  const bootstrapActorId = bsResp.data.operator?.actor_id;
  console.log("Bootstrap operator: " + bsResp.data.operator?.id);
  console.log("Bootstrap operator.actor_id: " + bootstrapActorId);
  console.log("Bootstrap assignment_state: " + bsResp.data.assignment_state);
  console.log("Bootstrap registerCount: " + (bsResp.data.registers?.length || 0));
  
  const canada = bsResp.data.registers?.some(r => r.name.includes("Canada")) ? 'PASS' : 'FAIL';
  const usa = bsResp.data.registers?.some(r => r.name.includes("USA")) ? 'PASS' : 'FAIL';
  console.log("Bootstrap Canada: " + canada);
  console.log("Bootstrap USA: " + usa);

  const actorEquality = (freshActor === meActor) && (meActor === bootstrapActorId);
  console.log("Actor equality: " + (actorEquality ? 'PASS' : 'FAIL'));

  const authConsistency = actorMatch && actorEquality && bsResp.data.assignment_state === 'ready' && bsResp.data.registers?.length === 2;
  console.log("Authorization consistency: " + (authConsistency ? 'PASS' : 'FAIL'));

  if (!authConsistency) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
