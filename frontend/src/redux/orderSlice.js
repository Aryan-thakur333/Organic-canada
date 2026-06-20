import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  orders: [],
  currentOrder: null,
  loading: false,
  error: null,
};

const orderSlice = createSlice({
  name: "order",
  initialState,
  reducers: {
    setOrderLoading: (state, action) => {
      state.loading = Boolean(action.payload);
    },
    setOrders: (state, action) => {
      state.orders = action.payload || [];
      state.loading = false;
      state.error = null;
    },
    addOrder: (state, action) => {
      state.orders.unshift(action.payload);
      state.currentOrder = action.payload;
    },
    setCurrentOrder: (state, action) => {
      state.currentOrder =
        state.orders.find((order) => order.id === action.payload) || null;
    },
    updateOrderStatus: (state, action) => {
      const { id, status } = action.payload || {};
      const target = state.orders.find((order) => order.id === id);
      if (target) target.status = status;
      if (state.currentOrder?.id === id) {
        state.currentOrder = { ...state.currentOrder, status };
      }
    },
    setOrderError: (state, action) => {
      state.error = action.payload || "Unable to process order";
      state.loading = false;
    },
    clearCurrentOrder: (state) => {
      state.currentOrder = null;
    },
    clearOrders: () => initialState,
    clearOrderError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setOrderLoading,
  setOrders,
  addOrder,
  setCurrentOrder,
  updateOrderStatus,
  setOrderError,
  clearCurrentOrder,
  clearOrders,
  clearOrderError,
} = orderSlice.actions;

export default orderSlice.reducer;
