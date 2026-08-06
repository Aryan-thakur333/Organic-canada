import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import reducer, { addPosItem, setPosRegister, setPosSession, setStaff } from "./posSlice";

describe("POS cart barcode integration", () => {
  it("increments an existing variant instead of adding a duplicate row", () => {
    const store = configureStore({ reducer: { pos: reducer } });
    const item = { product_id: "p1", variant_id: "v1", title: "Apple", quantity: 1, unit_price: 499, currency_code: "cad", inventory: 8 };
    store.dispatch(addPosItem(item));
    store.dispatch(addPosItem({ ...item, quantity: 2 }));
    expect(store.getState().pos.items).toHaveLength(1);
    expect(store.getState().pos.items[0]).toMatchObject({ quantity: 3, line_total: 1497 });
  });
  it("enforces register-location availability across repeated scans", () => {
    const store = configureStore({ reducer: { pos: reducer } });
    const item = { product_id: "p1", variant_id: "v1", title: "Chocolate", quantity: 1, unit_price: 1699, currency_code: "usd", inventory: 2 };
    store.dispatch(addPosItem(item));
    store.dispatch(addPosItem(item));
    store.dispatch(addPosItem(item));
    expect(store.getState().pos.items).toHaveLength(1);
    expect(store.getState().pos.items[0]).toMatchObject({ quantity: 2, line_total: 3398 });
  });
  it("clears stale register, session, and cart state when the operator changes", () => {
    const store = configureStore({ reducer: { pos: reducer } });
    store.dispatch(setStaff({ id: "operator_1" }));
    store.dispatch(setPosRegister({ id: "register_us", currency_code: "usd" }));
    store.dispatch(setPosSession({ id: "session_1", operator_id: "operator_1", register_id: "register_us" }));
    store.dispatch(addPosItem({ product_id: "p1", variant_id: "v1", quantity: 1, unit_price: 1699, inventory: 2 }));
    store.dispatch(setStaff({ id: "operator_2" }));
    expect(store.getState().pos).toMatchObject({ staff: { id: "operator_2" }, register: null, session: null, items: [] });
  });
});
