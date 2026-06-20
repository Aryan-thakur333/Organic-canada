import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  isAuthenticated: false,
  token: localStorage.getItem("vendor_token") || null,
  profile: null,
  products: [],
  orders: [],
  stats: {
    revenue: 0,
    orders: 0,
    products: 0,
    avgOrderValue: 0,
  },
  loading: false,
  error: null,
  authResolved: false,
};

const vendorSlice = createSlice({
  name: "vendor",
  initialState,
  reducers: {
    vendorStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    vendorSuccess: (state) => {
      state.loading = false;
      state.error = null;
    },
    vendorFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload || "An error occurred";
    },
    loginSuccess: (state, action) => {
      state.isAuthenticated = true;
      state.token = action.payload.token;
      state.profile = action.payload.vendor;
      state.loading = false;
      state.error = null;
      state.authResolved = true;
      localStorage.setItem("vendor_token", action.payload.token);
    },
    setProfile: (state, action) => {
      state.profile = action.payload;
      state.isAuthenticated = true;
      state.authResolved = true;
    },
    setProducts: (state, action) => {
      state.products = action.payload;
    },
    setOrders: (state, action) => {
      state.orders = action.payload;
    },
    setStats: (state, action) => {
      state.stats = action.payload;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.token = null;
      state.profile = null;
      state.products = [];
      state.orders = [];
      state.stats = {
        revenue: 0,
        orders: 0,
        products: 0,
        avgOrderValue: 0,
      };
      state.authResolved = true;
      localStorage.removeItem("vendor_token");
    },
    clearError: (state) => {
      state.error = null;
    },
    authResolved: (state) => {
      state.authResolved = true;
    },
  },
});

export const {
  vendorStart,
  vendorSuccess,
  vendorFailure,
  loginSuccess,
  setProfile,
  setProducts,
  setOrders,
  setStats,
  logout,
  clearError,
  authResolved,
} = vendorSlice.actions;

export default vendorSlice.reducer;
