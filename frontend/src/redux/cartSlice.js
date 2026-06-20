import { createSlice } from "@reduxjs/toolkit";

const CART_KEY = "eatsie_cart_v3";

const defaultPromo = () => ({ code: null, discount: 0 });

const defaultServerTotals = () => ({
  currency_code: "usd",
  subtotal: 0,
  tax: 0,
  discount: 0,
  shipping: 0,
  total: 0,
});

function readCartState() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) {
      return {
        items: [],
        promo: defaultPromo(),
        medusaCartId: "",
        regionId: "",
        currencyCode: "usd",
        serverTotals: defaultServerTotals(),
      };
    }
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 3) {
      return {
        items: [],
        promo: defaultPromo(),
        medusaCartId: "",
        regionId: "",
        currencyCode: "usd",
        serverTotals: defaultServerTotals(),
      };
    }
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      promo: {
        code: parsed.promo?.code ?? null,
        discount: Math.max(0, Number(parsed.promo?.discount) || 0),
      },
      medusaCartId: typeof parsed.medusaCartId === "string" ? parsed.medusaCartId : "",
      regionId: typeof parsed.regionId === "string" ? parsed.regionId : "",
      currencyCode: typeof parsed.currencyCode === "string" ? parsed.currencyCode : "usd",
      serverTotals: {
        ...defaultServerTotals(),
        ...(parsed.serverTotals && typeof parsed.serverTotals === "object"
          ? parsed.serverTotals
          : {}),
      },
    };
  } catch {
    return {
      items: [],
      promo: defaultPromo(),
      medusaCartId: "",
      regionId: "",
      currencyCode: "usd",
      serverTotals: defaultServerTotals(),
    };
  }
}

const initial = readCartState();

function persistCart(state) {
  try {
    localStorage.setItem(
      CART_KEY,
      JSON.stringify({
        version: 3,
        items: state.items,
        promo: state.promo,
        medusaCartId: state.medusaCartId,
        regionId: state.regionId,
        currencyCode: state.currencyCode,
        serverTotals: state.serverTotals,
      })
    );
  } catch {
    // Ignore storage write issues.
  }
}

const cartSlice = createSlice({
  name: "cart",
  initialState: {
    items: initial.items,
    promo: initial.promo,
    medusaCartId: initial.medusaCartId,
    regionId: initial.regionId,
    currencyCode: initial.currencyCode,
    serverTotals: initial.serverTotals,
  },
  reducers: {
    hydrateFromMedusa: (state, action) => {
      const p = action.payload || {};
      if (p.medusaCartId) state.medusaCartId = String(p.medusaCartId);
      if (p.regionId != null) state.regionId = String(p.regionId || "");
      if (p.currencyCode) state.currencyCode = String(p.currencyCode);
      if (Array.isArray(p.items)) state.items = p.items;
      if (p.promo) {
        state.promo = {
          code: p.promo.code ?? null,
          discount: Math.max(0, Number(p.promo.discount) || 0),
        };
      }
      if (p.serverTotals && typeof p.serverTotals === "object") {
        state.serverTotals = { ...defaultServerTotals(), ...p.serverTotals };
      }
      persistCart(state);
    },

    setMedusaCartId: (state, action) => {
      state.medusaCartId = String(action.payload || "");
      persistCart(state);
    },

    addToCart: (state, action) => {
      const { quantity: rawQty, ...line } = action.payload;
      const qty = Math.min(99, Math.max(1, Number(rawQty) || 1));
      const maxQ = Math.min(99, Math.max(1, Number(line.maxQuantity) || 99));
      const cappedQty = Math.min(qty, maxQ);
      const existing = state.items.find((item) => item.id === line.id);

      if (existing) {
        existing.quantity = Math.min(maxQ, existing.quantity + cappedQty);
      } else {
        state.items.push({
          ...line,
          maxQuantity: maxQ,
          quantity: cappedQty,
        });
      }
      persistCart(state);
    },

    removeFromCart: (state, action) => {
      state.items = state.items.filter((item) => item.id !== action.payload);
      persistCart(state);
    },

    increaseQty: (state, action) => {
      const item = state.items.find((i) => i.id === action.payload);
      if (!item) return;
      const maxQ = Math.min(99, Math.max(1, Number(item.maxQuantity) || 99));
      item.quantity = Math.min(maxQ, item.quantity + 1);
      persistCart(state);
    },

    decreaseQty: (state, action) => {
      const item = state.items.find((i) => i.id === action.payload);
      if (!item) return;
      if (item.quantity > 1) {
        item.quantity -= 1;
      } else {
        state.items = state.items.filter((i) => i.id !== action.payload);
      }
      persistCart(state);
    },

    clearCart: (state) => {
      state.items = [];
      state.promo = defaultPromo();
      state.medusaCartId = "";
      state.regionId = "";
      state.currencyCode = "usd";
      state.serverTotals = defaultServerTotals();
      persistCart(state);
    },

    setCartPromo: (state, action) => {
      const code = action.payload?.code ?? null;
      const discount = Math.max(0, Number(action.payload?.discount) || 0);
      state.promo = { code, discount };
      persistCart(state);
    },

    clearCartPromo: (state) => {
      state.promo = defaultPromo();
      persistCart(state);
    },
  },
});

export const {
  addToCart,
  removeFromCart,
  increaseQty,
  decreaseQty,
  clearCart,
  setCartPromo,
  clearCartPromo,
  hydrateFromMedusa,
  setMedusaCartId,
} = cartSlice.actions;

export default cartSlice.reducer;
