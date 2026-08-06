import { createSlice } from "@reduxjs/toolkit";
import { getPosRegister, getPosStaff } from "../services/posApi";

const initialState = {
  staff: getPosStaff(),
  register: getPosRegister(),
  session: null,
  items: [],
  customer: null,
  paymentMethod: "CASH",
  discountCode: "",
  note: "",
  lastOrder: null,
  lastReceipt: null,
};

const lineTotal = (item) => Number(item.unit_price || 0) * Number(item.quantity || 0);

const posSlice = createSlice({
  name: "pos",
  initialState,
  reducers: {
    setStaff: (state, action) => {
      if (state.staff?.id && state.staff.id !== action.payload?.id) {
        state.register = null;
        state.session = null;
        state.items = [];
        state.customer = null;
      }
      state.staff = action.payload;
    },
    logoutStaff: (state) => {
      state.staff = null;
      state.register = null;
      state.session = null;
      state.items = [];
      state.customer = null;
    },
    setPosRegister: (state, action) => { state.register = action.payload; },
    setPosSession: (state, action) => { state.session = action.payload; },
    clearPosRegisterContext: (state) => {
      state.register = null;
      state.session = null;
      state.items = [];
      state.customer = null;
    },
    addPosItem: (state, action) => {
      const item = action.payload;
      const existing = state.items.find((line) => line.variant_id === item.variant_id);
      if (existing) {
        const inventoryLimit = existing.allow_backorder || existing.inventory == null ? 999 : Math.max(0, Number(existing.inventory));
        existing.quantity = Math.min(999, inventoryLimit, existing.quantity + Math.max(1, Number(item.quantity || 1)));
        existing.line_total = lineTotal(existing);
        return;
      }
      const inventoryLimit = item.allow_backorder === true || item.inventory == null ? 999 : Math.max(0, Number(item.inventory));
      if (inventoryLimit <= 0) return;
      const quantity = Math.min(inventoryLimit, Math.max(1, Number(item.quantity || 1)));
      state.items.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        title: item.title,
        variant_title: item.variant_title,
        sku: item.sku,
        barcode: item.barcode,
        upc: item.upc,
        ean: item.ean,
        quantity,
        unit_price: Number(item.unit_price ?? item.price ?? item.calculated_price ?? 0),
        currency_code: item.currency_code || "cad",
        inventory: item.inventory,
        allow_backorder: item.allow_backorder === true,
        line_total: Number(item.unit_price ?? item.price ?? item.calculated_price ?? 0) * quantity,
      });
    },
    updatePosQty: (state, action) => {
      const item = state.items.find((line) => line.variant_id === action.payload.variant_id);
      if (!item) return;
      const inventoryLimit = item.allow_backorder || item.inventory == null ? 999 : Math.max(1, Number(item.inventory));
      item.quantity = Math.max(1, Math.min(999, inventoryLimit, Number(action.payload.quantity || 1)));
      item.line_total = lineTotal(item);
    },
    removePosItem: (state, action) => {
      state.items = state.items.filter((line) => line.variant_id !== action.payload);
    },
    clearPosCart: (state) => {
      state.items = [];
      state.customer = null;
      state.discountCode = "";
      state.note = "";
      state.paymentMethod = "CASH";
    },
    setPosCustomer: (state, action) => {
      state.customer = action.payload;
    },
    setPaymentMethod: (state, action) => {
      state.paymentMethod = action.payload;
    },
    setDiscountCode: (state, action) => {
      state.discountCode = action.payload;
    },
    setPosNote: (state, action) => {
      state.note = action.payload;
    },
    setLastPosOrder: (state, action) => {
      state.lastOrder = action.payload?.order || null;
      state.lastReceipt = action.payload?.receipt || null;
    },
  },
});

export const selectPosSubtotal = (state) =>
  state.pos.items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);

export const {
  setStaff,
  setPosRegister,
  setPosSession,
  clearPosRegisterContext,
  logoutStaff,
  addPosItem,
  updatePosQty,
  removePosItem,
  clearPosCart,
  setPosCustomer,
  setPaymentMethod,
  setDiscountCode,
  setPosNote,
  setLastPosOrder,
} = posSlice.actions;

export default posSlice.reducer;
