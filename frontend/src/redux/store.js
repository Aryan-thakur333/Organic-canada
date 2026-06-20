import { configureStore } from "@reduxjs/toolkit";
import cartReducer from "./cartSlice";
import authReducer from "./authSlice";
import userReducer from "./userSlice";
import orderReducer from "./orderSlice";
import wishlistReducer from "./wishlistSlice";
import vendorReducer from "./vendorSlice";

const reducer = {
  cart: cartReducer,
  auth: authReducer,
  user: userReducer,
  order: orderReducer,
  wishlist: wishlistReducer,
  vendor: vendorReducer,
};

export const store = configureStore({
  reducer,
});
