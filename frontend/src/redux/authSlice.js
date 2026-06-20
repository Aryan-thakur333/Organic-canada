import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  isAuthenticated: false,
  token: null,
  loading: false,
  error: null,
  otpSent: false,
  phone: "",
  /** False until initial session restoration check has completed. */
  authResolved: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    authStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    loginSuccess: (state, action) => {
      state.isAuthenticated = true;
      state.token = action.payload?.token ?? null;
      state.loading = false;
      state.error = null;
      state.otpSent = false;
      state.phone = "";
    },
    otpSent: (state, action) => {
      state.loading = false;
      state.error = null;
      state.otpSent = true;
      state.phone = action.payload || "";
    },
    loginFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload || "Authentication failed";
    },
    logout: () => ({
      ...initialState,
      authResolved: true,
    }),
    clearAuthError: (state) => {
      state.error = null;
    },
    authResolved: (state) => {
      state.authResolved = true;
    },
  },
});

export const {
  authStart,
  loginSuccess,
  otpSent,
  loginFailure,
  logout,
  clearAuthError,
  authResolved,
} = authSlice.actions;

export default authSlice.reducer;
