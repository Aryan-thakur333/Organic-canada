/**
 * Organic Canada grocery demo — API + static SPA + Stripe Checkout.
 *
 * Env (see .env.example):
 *   PORT, JWT_SECRET, DEMO_EMAIL, DEMO_PASSWORD, STRIPE_SECRET_KEY
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import Stripe from "stripe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3055;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production-use-long-random-string";
const DEMO_EMAIL = (process.env.DEMO_EMAIL || "user@example.com").toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "pass";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

/** @type {Map<string, Array<{id:string,qty:number}>>} */
const serverCarts = new Map();

function readProducts() {
  const file = path.join(__dirname, "data", "products.json");
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "Authorization Bearer token required" });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = { email: payload.email, sub: payload.sub };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

// —— API ——
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    stripe: !!stripe,
    time: new Date().toISOString(),
  });
});

app.get("/api/products", (_req, res) => {
  try {
    const products = readProducts();
    res.json({ products });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load catalog" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const token = jwt.sign({ sub: email, email }, JWT_SECRET, { expiresIn: "7d" });
  const defaultCart = [{ id: "apple", qty: 3 }];
  if (!serverCarts.has(email)) serverCarts.set(email, defaultCart);
  return res.json({
    token,
    user: { email },
    cart: serverCarts.get(email),
  });
});

app.post("/api/auth/register", (_req, res) => {
  res.status(403).json({
    error: "Registration is disabled in this demo. Sign in with the demo account.",
    demoEmail: DEMO_EMAIL,
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: { email: req.user.email } });
});

app.get("/api/cart", requireAuth, (req, res) => {
  const email = req.user.email;
  if (!serverCarts.has(email)) serverCarts.set(email, [{ id: "apple", qty: 3 }]);
  res.json({ lines: serverCarts.get(email) });
});

app.put("/api/cart", requireAuth, (req, res) => {
  const lines = req.body?.lines;
  if (!Array.isArray(lines)) {
    return res.status(400).json({ error: "Body must include { lines: [{ id, qty }, ...] }" });
  }
  const cleaned = [];
  for (const row of lines) {
    const id = String(row?.id || "").trim();
    const qty = Math.max(0, Math.min(99, parseInt(row?.qty, 10) || 0));
    if (!id || qty <= 0) continue;
    cleaned.push({ id, qty });
  }
  serverCarts.set(req.user.email, cleaned);
  res.json({ ok: true, lines: cleaned });
});

/**
 * POST /api/create-checkout-session
 * Headers: Authorization: Bearer <jwt>
 * Body: { successUrl, cancelUrl, lineItems: [{ name, unitAmountCents, quantity }] }
 */
app.post("/api/create-checkout-session", requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error:
        "Stripe is not configured. Copy .env.example to .env and set STRIPE_SECRET_KEY (test mode).",
    });
  }

  try {
    const { successUrl, cancelUrl } = req.body || {};
    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ error: "Missing successUrl or cancelUrl." });
    }

    const catalog = readProducts();
    const byId = Object.fromEntries(catalog.map((p) => [p.id, p]));
    const serverCart = serverCarts.get(req.user.email) || [];
    if (!serverCart.length) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const items = [];
    for (const line of serverCart) {
      const p = byId[line.id];
      if (!p) return res.status(400).json({ error: `Unknown product: ${line.id}` });
      const qty = Math.max(1, Math.min(99, Number(line.qty) || 1));
      items.push({
        quantity: qty,
        price_data: {
          currency: "usd",
          unit_amount: Math.max(50, Math.round(Number(p.price) * 100)),
          product_data: { name: String(p.name).slice(0, 120) },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: items,
      client_reference_id: req.user.email,
      success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      shipping_address_collection: {
        allowed_countries: ["IN", "US", "GB", "CA", "AU", "DE", "FR", "SG", "AE"],
      },
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
    });

    return res.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message || "Stripe error" });
  }
});

// Static SPA (after API routes)
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Organic Canada demo: http://localhost:${PORT}`);
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/products`);
  console.log(`  POST /api/auth/login`);
  if (!stripe) console.warn("[supermarket-demo] STRIPE_SECRET_KEY missing — Checkout disabled until set.");
  if (JWT_SECRET.length < 20) console.warn("[supermarket-demo] Use a long JWT_SECRET in production.");
});
