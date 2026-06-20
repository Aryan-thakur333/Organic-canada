import { Router } from "express";
import Stripe from "stripe";
import { computeOrderTotals } from "../lib/totals.js";
import { sendError, sendOk } from "../lib/http.js";
import { insertOrder, listOrders, getOrderById, updateOrder, newOrderId, normalizePhoneDigits } from "../lib/ordersStore.js";
import { createStripePaymentIntent } from "../lib/createPaymentIntent.js";

/**
 * @param {import('express').Request} req
 */
function isAdminAuthorized(req) {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return true;
  return req.get("x-admin-key") === key;
}

/**
 * @param {unknown} body
 */
function validateCustomer(body) {
  const customer = body?.customer;
  if (!customer || typeof customer !== "object") {
    return { error: "Customer details are required." };
  }
  const name = String(customer.name || "").trim();
  const phoneRaw = String(customer.phone || "").trim();
  const phone = normalizePhoneDigits(phoneRaw);
  const address = String(customer.address || "").trim();
  if (!name) return { error: "Customer name is required." };
  if (phone.length < 10) return { error: "Customer phone must include at least 10 digits." };
  if (!address) return { error: "Customer address is required." };
  return { customer: { name, phone, address } };
}

/**
 * @param {unknown} body
 */
function validateItems(body) {
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "At least one cart item is required." };
  }
  const normalized = items.map((line) => ({
    id: String(line?.id ?? ""),
    title: String(line?.title ?? "Item"),
    price: Number(line?.price),
    quantity: Number(line?.quantity) || 1,
    image: line?.image ?? line?.thumbnail ?? null,
  }));
  for (const line of normalized) {
    if (!line.id) return { error: "Each item must include an id." };
  }
  return { items: normalized };
}

export function buildV1Router() {
  const router = Router();
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  router.post("/payment-intents", async (req, res) => {
    try {
      const { clientSecret, paymentIntentId } = await createStripePaymentIntent({
        stripeSecretKey,
        amount: req.body?.amount,
        currency: req.body?.currency,
      });
      sendOk(res, { clientSecret, paymentIntentId });
    } catch (err) {
      const code = err?.code === "STRIPE_NOT_CONFIGURED" ? "STRIPE_NOT_CONFIGURED" : "PAYMENT_INTENT_FAILED";
      const status = code === "STRIPE_NOT_CONFIGURED" ? 503 : 400;
      sendError(res, status, code, err?.message || "Unable to create payment intent");
    }
  });

  router.post("/orders", async (req, res) => {
    try {
      const fulfillment = String(req.body?.fulfillment || "").toLowerCase();
      if (fulfillment !== "stripe" && fulfillment !== "cod") {
        return sendError(res, 400, "INVALID_FULFILLMENT", 'fulfillment must be "stripe" or "cod".');
      }

      const c = validateCustomer(req.body);
      if (c.error) return sendError(res, 400, "VALIDATION_ERROR", c.error);

      const it = validateItems(req.body);
      if (it.error) return sendError(res, 400, "VALIDATION_ERROR", it.error);

      const discount = Math.max(0, Number(req.body?.discount) || 0);

      let totals;
      try {
        totals = computeOrderTotals(it.items, { discount });
      } catch (e) {
        return sendError(res, 400, "INVALID_CART", e?.message || "Invalid cart");
      }

      const paymentMethod = String(req.body?.paymentMethod || fulfillment).slice(0, 32);

      if (fulfillment === "cod") {
        const order = {
          id: newOrderId(),
          fulfillment: "cod",
          paymentMethod,
          status: "confirmed",
          paymentIntentId: null,
          ...totals,
          discount: totals.discountCents / 100,
          customer: c.customer,
          items: it.items,
          createdAt: new Date().toISOString(),
        };
        await insertOrder(order);
        if (process.env.NODE_ENV !== "production") {
          console.info("[checkout] COD order saved", order.id);
        }
        return sendOk(res, { order: publicOrder(order) });
      }

      const paymentIntentId = String(req.body?.paymentIntentId || "").trim();
      if (!paymentIntentId) {
        return sendError(res, 400, "PAYMENT_INTENT_REQUIRED", "paymentIntentId is required for card checkout.");
      }

      if (!stripeSecretKey) {
        return sendError(res, 503, "STRIPE_NOT_CONFIGURED", "Stripe is not configured on the server.");
      }

      const stripe = new Stripe(stripeSecretKey);
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (pi.status !== "succeeded" && pi.status !== "processing") {
        return sendError(res, 400, "PAYMENT_NOT_COMPLETE", `Payment is not complete (status: ${pi.status}).`, {
          status: pi.status,
        });
      }

      if (totals.totalCents < 50) {
        return sendError(
          res,
          400,
          "AMOUNT_TOO_SMALL",
          "Card payments require a total of at least $0.50 after discounts (Stripe minimum)."
        );
      }

      if (Math.abs(pi.amount - totals.totalCents) > 2) {
        return sendError(res, 400, "AMOUNT_MISMATCH", "Paid amount does not match the current cart total.", {
          expectedCents: totals.totalCents,
          actualCents: pi.amount,
        });
      }

      const cur = String(pi.currency || "usd").toLowerCase();
      if (cur !== "usd") {
        return sendError(res, 400, "CURRENCY_MISMATCH", "Only USD checkout is supported for this storefront.");
      }

      const order = {
        id: newOrderId(),
        fulfillment: "stripe",
        paymentMethod,
        status: "paid",
        paymentIntentId,
        ...totals,
        discount: totals.discountCents / 100,
        customer: c.customer,
        items: it.items,
        createdAt: new Date().toISOString(),
      };

      await insertOrder(order);
      if (process.env.NODE_ENV !== "production") {
        console.info("[checkout] order saved", order.id, "totalCents", order.totalCents);
      }
      return sendOk(res, { order: publicOrder(order) });
    } catch (err) {
      console.error(err);
      sendError(res, 500, "ORDER_CREATE_FAILED", err?.message || "Unable to create order");
    }
  });

  router.get("/orders", async (req, res) => {
    try {
      const phone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";

      if (phone) {
        const orders = await listOrders({ phone });
        return sendOk(res, { orders: orders.map(publicOrder) });
      }

      if (!isAdminAuthorized(req)) {
        return sendError(
          res,
          401,
          "UNAUTHORIZED",
          "Pass ?phone= to list your orders, or send x-admin-key when ADMIN_API_KEY is configured."
        );
      }

      const orders = await listOrders();
      sendOk(res, { orders: orders.map(publicOrder) });
    } catch (err) {
      console.error(err);
      sendError(res, 500, "LIST_ORDERS_FAILED", err?.message || "Unable to list orders");
    }
  });

  router.get("/orders/:id", async (req, res) => {
    try {
      const order = await getOrderById(req.params.id);
      if (!order) return sendError(res, 404, "NOT_FOUND", "Order not found.");
      if (!isAdminAuthorized(req)) {
        const phone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
        const orderPhone = normalizePhoneDigits(order.customer?.phone || "");
        const qPhone = normalizePhoneDigits(phone);
        if (!qPhone || orderPhone !== qPhone) {
          return sendError(res, 403, "FORBIDDEN", "Provide a matching ?phone= query to view this order.");
        }
      }
      sendOk(res, { order: publicOrder(order) });
    } catch (err) {
      console.error(err);
      sendError(res, 500, "GET_ORDER_FAILED", err?.message || "Unable to load order");
    }
  });

  router.patch("/orders/:id/cancel", async (req, res) => {
    try {
      const id = req.params.id;
      const updated = await updateOrder(id, (o) => {
        if (!o) return null;
        if (o.status === "cancelled") return o;
        if (o.status === "paid" || o.status === "pending_payment" || o.status === "confirmed") {
          return { ...o, status: "cancelled", cancelledAt: new Date().toISOString() };
        }
        return null;
      });
      if (!updated) return sendError(res, 400, "CANCEL_NOT_ALLOWED", "Order cannot be cancelled.");
      sendOk(res, { order: publicOrder(updated) });
    } catch (err) {
      console.error(err);
      sendError(res, 500, "CANCEL_FAILED", err?.message || "Unable to cancel order");
    }
  });

  return router;
}

/**
 * @param {any} order
 */
function publicOrder(order) {
  const discountDollars =
    typeof order.discount === "number"
      ? order.discount
      : (Number(order.discountCents) || 0) / 100;
  return {
    id: order.id,
    fulfillment: order.fulfillment,
    paymentMethod: order.paymentMethod,
    status: order.status,
    paymentIntentId: order.paymentIntentId,
    subtotal: order.subtotal,
    tax: order.tax,
    discount: discountDollars,
    total: order.total,
    totalCents: order.totalCents,
    customer: order.customer,
    items: order.items,
    createdAt: order.createdAt,
    cancelledAt: order.cancelledAt ?? null,
  };
}
