/**
 * Audit 2026-08-05: POS auth E2E verification (read-only).
 * Canonical actor: user_01KWPV0WK7J0KN2A8FZ0AD3T16 (admin@eatsie.com)
 * Expected: Canada + USA registers, assignment_state=ready, registerCount=2.
 */
const BASE = "http://localhost:9000"

async function api(method, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text.slice(0, 300) }
  return { status: res.status, body }
}

async function main() {
  console.log("═══ AUDIT: POS AUTH E2E ═══\n")
  const CANONICAL_ACTOR = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"

  // 1. POS user login (bearer token)
  const login = await api("POST", "/auth/user/emailpass?returnAccessToken=true", {
    body: { email: "admin@eatsie.com", password: "123456" },
  })
  const token = login.body?.access_token || login.body?.token
  console.log("1. POS login:", token ? "OK" : `FAIL (${login.status}) ${JSON.stringify(login.body).slice(0,200)}`)
  if (!token) return
  const auth = { Authorization: `Bearer ${token}` }

  // 2. /pos/me
  const me = await api("GET", "/pos/me", { headers: auth })
  console.log("\n2. /pos/me:", me.status)
  if (me.body) {
    console.log("   actor_id:", me.body.actor_id, me.body.actor_id === CANONICAL_ACTOR ? "✅ MATCH" : "❌ MISMATCH")
    console.log("   operator_id:", me.body.operator_id)
    console.log("   operator_user_id:", me.body.operator_user_id)
  } else console.log(JSON.stringify(me.body))

  // 3. /pos/bootstrap
  const boot = await api("GET", "/pos/bootstrap", { headers: auth })
  console.log("\n3. /pos/bootstrap:", boot.status)
  const b = boot.body
  if (b) {
    console.log("   authenticated:", b.authenticated)
    console.log("   operator.actor_id:", b.operator?.actor_id, b.operator?.actor_id === CANONICAL_ACTOR ? "✅ MATCH" : "❌ MISMATCH")
    console.log("   operator.id (operatorId):", b.operator?.id)
    console.log("   operator.user_id:", b.operator?.user_id)
    console.log("   assignment_state:", b.assignment_state)
    console.log("   register_count:", b.meta?.register_count)
    console.log("   registers:", (b.registers || []).map(r => ({ id: r.id, name: r.name, status: r.status })))
    console.log("   session:", b.session ? "present" : "none")
  }

  // 4. Register assignment check via register list endpoint
  const regs = await api("GET", "/pos/me/registers", { headers: auth })
  console.log("\n4. /pos/me/registers:", regs.status)
  if (regs.body) console.log(JSON.stringify(regs.body).slice(0, 600))

  console.log("\n═══ END ═══")
}

main().catch((e) => { console.error(e); process.exit(1) })
