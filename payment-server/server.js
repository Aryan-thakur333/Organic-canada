import "dotenv/config";
import express from "express";
import cors from "cors";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildV1Router } from "./routes/v1.js";import { createStripePaymentIntent } from "./lib/createPaymentIntent.js";
import { sendError } from "./lib/http.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORDERS_FILE = join(__dirname, "data", "orders.json");

const PORT = Number(process.env.PORT) || 4242;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const app = express();
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
    ],
  })
);
app.use(express.json({ limit: "512kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "eatsie-checkout", version: 1 });
});

/** @deprecated Use POST /v1/payment-intents — kept for existing Vite proxy path. */
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { clientSecret } = await createStripePaymentIntent({
      stripeSecretKey,
      amount: req.body?.amount,
      currency: req.body?.currency,
    });
    res.json({ clientSecret });
  } catch (err) {
    const status = err?.code === "STRIPE_NOT_CONFIGURED" ? 503 : 400;
    console.error(err);
    res.status(status).json({
      error: err?.message || "Unable to create payment intent",
    });
  }
});

app.use("/v1", buildV1Router());

/** Consistent JSON errors for unhandled routes */
app.use((req, res) => {
  sendError(res, 404, "NOT_FOUND", `No route for ${req.method} ${req.path}`);
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  sendError(res, 500, "INTERNAL_ERROR", err?.message || "Internal server error");
});

app.listen(PORT, () => {
  console.log(`Checkout & payment server: http://localhost:${PORT}`);
  console.log(`  Orders persist to: ${ORDERS_FILE}`);
  console.log(`  GET  /health`);  console.log(`  POST /create-payment-intent (legacy)`);
  console.log(`  POST /v1/payment-intents`);
  console.log(`  POST /v1/orders`);
  console.log(`  GET  /v1/orders`);
  console.log(`  GET  /v1/orders/:id`);
  console.log(`  PATCH /v1/orders/:id/cancel`);
});
