import { createSlice } from "@reduxjs/toolkit";

const WISHLIST_KEY = "eatsie_wishlist";

function readWishlistFromStorage() {
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistWishlist(items) {
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function toWishlistShape(product) {
  return {
    id: product.id,
    title: product.title,
    thumbnail: product.thumbnail,
    description: product.description,
    vendor: product.vendor,
    rating: product.rating,
    variants: product.variants,
  };
}

const wishlistSlice = createSlice({
  name: "wishlist",
  initialState: {
    items: readWishlistFromStorage(),
  },
  reducers: {
    toggleWishlist: (state, action) => {
      const payload = action.payload;
      const exists = state.items.find((i) => i.id === payload.id);
      if (exists) {
        state.items = state.items.filter((i) => i.id !== payload.id);
      } else {
        state.items.push(toWishlistShape(payload));
      }
      persistWishlist(state.items);
    },
    removeFromWishlist: (state, action) => {
      state.items = state.items.filter((i) => i.id !== action.payload);
      persistWishlist(state.items);
    },
  },
});

export const { toggleWishlist, removeFromWishlist } = wishlistSlice.actions;
export default wishlistSlice.reducer;
