import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import reducer, {
  addPosItem,
  clearPosCart,
  clearPosRegisterContext,
  logoutStaff,
  removePosItem,
  selectPosSubtotal,
  setPaymentMethod,
  setPosCustomer,
  setPosRegister,
  setPosSession,
  setStaff,
  updatePosQty,
} from "../redux/posSlice";

vi.mock("../services/posApi", () => ({
  getPosRegister: () => null,
  getPosStaff: () => null,
}));

const USA_REGISTER_ID = "01KYMKWP9T4YWNMZA47AZNQSY3";
const USA_OPERATOR_ID = "user_01KWPV0WK7J0KN2A8FZ0AD3T16";
const usaRegister = { id: USA_REGISTER_ID, name: "USA POS Register", code: "US-POS-01", currency_code: "usd" };
const usaSession = { id: "01KYP39VH0W0JKFYZMNNYPA6A9", register_id: USA_REGISTER_ID, operator_id: USA_OPERATOR_ID, status: "OPEN" };
const chocolate = {
  product_id: "prod_01KXJNH57CMPRBEVGSAMB30EMF",
  variant_id: "variant_01KXJNH5ASR8XNZ9QSW29B8SJ7",
  title: "chocolate",
  variant_title: "Standard",
  sku: "VENDOR-mrly26sn-1",
  barcode: "999999999",
  quantity: 1,
  unit_price: 1699,
  currency_code: "usd",
  inventory: 20,
  allow_backorder: false,
};

const makeStore = () => configureStore({ reducer: { pos: reducer } });
const readyStore = () => {
  const store = makeStore();
  store.dispatch(setStaff({ id: USA_OPERATOR_ID, email: "operator@eatsie.com" }));
  store.dispatch(setPosRegister(usaRegister));
  store.dispatch(setPosSession(usaSession));
  return store;
};

describe("PHASE 4 post-restart POS runtime regression", () => {
  it("1. stores the authorized USA operator identity", () => {
    const store = readyStore();
    expect(store.getState().pos.staff.id).toBe(USA_OPERATOR_ID);
  });

  it("2. stores the USA register as the active register", () => {
    const store = readyStore();
    expect(store.getState().pos.register).toMatchObject({ id: USA_REGISTER_ID, currency_code: "usd" });
  });

  it("3. stores the existing USA open session", () => {
    const store = readyStore();
    expect(store.getState().pos.session).toMatchObject({ id: usaSession.id, status: "OPEN" });
  });

  it("4. treats session as ready only when operator and register match", () => {
    const store = readyStore();
    const state = store.getState().pos;
    expect(state.session.operator_id === state.staff.id && state.session.register_id === state.register.id).toBe(true);
  });

  it("5. first chocolate scan creates one cart row", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    expect(store.getState().pos.items).toHaveLength(1);
  });

  it("6. first chocolate scan quantity is one", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    expect(store.getState().pos.items[0].quantity).toBe(1);
  });

  it("7. first chocolate scan keeps USD currency", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    expect(store.getState().pos.items[0].currency_code).toBe("usd");
  });

  it("8. first chocolate scan totals USD 16.99 in minor units", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    expect(selectPosSubtotal(store.getState())).toBe(1699);
  });

  it("9. second chocolate scan increments the existing row", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    store.dispatch(addPosItem(chocolate));
    expect(store.getState().pos.items).toHaveLength(1);
  });

  it("10. second chocolate scan quantity is two", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    store.dispatch(addPosItem(chocolate));
    expect(store.getState().pos.items[0].quantity).toBe(2);
  });

  it("11. second chocolate scan totals USD 33.98 in minor units", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    store.dispatch(addPosItem(chocolate));
    expect(selectPosSubtotal(store.getState())).toBe(3398);
  });

  it("12. duplicate scans cannot exceed USA available inventory", () => {
    const store = readyStore();
    store.dispatch(addPosItem({ ...chocolate, quantity: 19 }));
    store.dispatch(addPosItem({ ...chocolate, quantity: 5 }));
    expect(store.getState().pos.items[0].quantity).toBe(20);
  });

  it("13. manual quantity updates also enforce USA inventory", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    store.dispatch(updatePosQty({ variant_id: chocolate.variant_id, quantity: 25 }));
    expect(store.getState().pos.items[0].quantity).toBe(20);
  });

  it("14. removing chocolate clears the cart row", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    store.dispatch(removePosItem(chocolate.variant_id));
    expect(store.getState().pos.items).toHaveLength(0);
  });

  it("15. clearing register context removes register, session, and cart", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    store.dispatch(clearPosRegisterContext());
    expect(store.getState().pos).toMatchObject({ register: null, session: null, items: [] });
  });

  it("16. logout and new sale cleanup do not leave POS cart state behind", () => {
    const store = readyStore();
    store.dispatch(addPosItem(chocolate));
    store.dispatch(setPosCustomer({ id: "cust_1" }));
    store.dispatch(setPaymentMethod("CARD_MANUAL"));
    store.dispatch(clearPosCart());
    expect(store.getState().pos.items).toHaveLength(0);
    store.dispatch(logoutStaff());
    expect(store.getState().pos.staff).toBeNull();
  });
});
