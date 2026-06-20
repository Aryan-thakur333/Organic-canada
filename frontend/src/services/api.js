import axios from "axios";
import { getMedusaSdk } from "../lib/medusa/client";

import {
  getMedusaBackendUrl,
  getMedusaPublishableKey,
  isMedusaConfigured,
} from "../config/publicEnv";

import {
  listStoreProducts,
  retrieveStoreProduct,
} from "./medusa/productService";

const BASE_URL = getMedusaBackendUrl();

const adminClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/* ---------------- FALLBACK PRODUCTS ---------------- */

export const fallbackProducts = [
  {
    id: "mock-1",
    title: "Classic Cheeseburger",
    description: "Juicy grilled patty with cheese.",
    thumbnail:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd",
    variants: [
      {
        id: "mock-v1",
        prices: [{ amount: 24900 }],
      },
    ],
  },
];

const fallbackCategories = [
  {
    id: "cat-1",
    name: "Burgers",
  },
];

const fallbackOrders = [];
const fallbackAddresses = [];

/* ---------------- PRODUCTS ---------------- */

export const getProducts = async () => {
  if (!isMedusaConfigured()) {
    return fallbackProducts;
  }

  try {
    const { products } = await listStoreProducts({
      limit: 200,
    });

    return products || [];
  } catch (err) {
    console.error("getProducts:", err);
    return [];
  }
};

export const getProductById = async (id) => {
  if (!isMedusaConfigured() || !id) {
    return null;
  }

  try {
    return await retrieveStoreProduct(String(id));
  } catch (err) {
    console.error("getProductById:", err);
    return null;
  }
};

export const searchProducts = async (query) => {
  if (!isMedusaConfigured()) {
    return fallbackProducts;
  }

  try {
    const { products } = await listStoreProducts({
      limit: 100,
      q: String(query || "").trim(),
    });

    return products || [];
  } catch (err) {
    console.error("searchProducts:", err);
    return [];
  }
};

export const filterProducts = async (filters = {}) => {
  if (!isMedusaConfigured()) {
    return fallbackProducts;
  }

  try {
    const { products } = await listStoreProducts({
      limit: 100,
      q: filters?.query || undefined,
    });

    return products || [];
  } catch (err) {
    console.error("filterProducts:", err);
    return [];
  }
};

/* ---------------- CATEGORIES ---------------- */

export const getCategories = async () => {
  if (!isMedusaConfigured()) {
    return fallbackCategories;
  }

  try {
    const medusa = getMedusaSdk();
    const { product_categories = [] } =
      await medusa.store.category.list({
        limit: 100,
      });

    return product_categories.map((category) => ({
      id: category.id,
      name: category.name,
    }));
  } catch (err) {
    console.error("getCategories:", err);
    return fallbackCategories;
  }
};

/* ---------------- ORDERS ---------------- */

export const createOrder = async (payload) => {
  if (!isMedusaConfigured()) {
    return {
      id: `order-${Date.now()}`,
      status: "confirmed",
      ...payload,
    };
  }

  try {
    const medusa = getMedusaSdk();
    return await medusa.client.fetch("/store/orders", {
      method: "POST",
      body: payload,
    });
  } catch (err) {
    console.error("createOrder:", err);

    return {
      id: `order-${Date.now()}`,
      status: "confirmed",
      ...payload,
    };
  }
};

export const fetchOrders = async () => {
  if (!isMedusaConfigured()) {
    return fallbackOrders;
  }

  try {
    const token = await medusa.client.getToken();

    if (!token) {
      return fallbackOrders;
    }

    const { orders = [] } = await medusa.store.order.list({
      limit: 50,
    });

    return orders;
  } catch (err) {
    console.error("fetchOrders:", err);
    return fallbackOrders;
  }
};

export const cancelOrder = async (orderId) => {
  if (!isMedusaConfigured()) {
    return { success: true };
  }

  try {
    const medusa = getMedusaSdk();
    await medusa.client.fetch(
      `/store/orders/${encodeURIComponent(orderId)}/cancel`,
      {
        method: "POST",
      }
    );

    return {
      success: true,
    };
  } catch (err) {
    console.error("cancelOrder:", err);

    return {
      success: false,
    };
  }
};

/* ---------------- COUPONS ---------------- */

export const applyCoupon = async (code, subtotal) => {
  const normalized = String(code || "")
    .trim()
    .toUpperCase();

  const sub = Math.max(0, Number(subtotal) || 0);

  if (normalized === "WELCOME50") {
    if (sub < 15) {
      return { success: false };
    }

    return {
      success: true,
      discountAmount: 5,
    };
  }

  return {
    success: false,
  };
};

/* ---------------- ADDRESSES ---------------- */

export const fetchAddresses = async () => {
  if (!isMedusaConfigured()) {
    return fallbackAddresses;
  }

  try {
    const medusa = getMedusaSdk();
    const token = await medusa.client.getToken();

    if (!token) {
      return fallbackAddresses;
    }

    const { addresses = [] } =
      await medusa.store.customer.listAddress({
        limit: 50,
      });

    return addresses;
  } catch (err) {
    console.error("fetchAddresses:", err);

    return fallbackAddresses;
  }
};

export const addAddress = async (payload) => ({
  success: true,
  id: `addr-${Date.now()}`,
  ...payload,
});

export const editAddress = async (addressId, payload) => ({
  success: true,
  id: addressId,
  ...payload,
});

export const deleteAddress = async (addressId) => ({
  success: true,
  id: addressId,
});

/* ---------------- REVIEWS ---------------- */

export const getProductReviews = async () => [
  {
    id: "r1",
    user: "Arya",
    rating: 5,
    comment: "Excellent taste and packaging.",
  },
];

/* ---------------- ADMIN ---------------- */

export const getAdminStats = async () => {
  const adminToken =
    import.meta.env.VITE_MEDUSA_ADMIN_TOKEN?.trim();

  if (!adminToken) {
    return {
      orders: 0,
      revenue: 0,
      users: 0,
      products: 0,
    };
  }

  try {
    const res = await adminClient.get("/admin/stats", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    return res.data;
  } catch (err) {
    console.error("getAdminStats:", err);

    return {
      orders: 0,
      revenue: 0,
      users: 0,
      products: 0,
    };
  }
};

export { BASE_URL };

export const PUBLISHABLE_KEY =
  getMedusaPublishableKey();