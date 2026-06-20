import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  profile: {
    id: null,
    name: "",
    email: "",
    phone: "",
    avatar: "",
  },
  loading: false,
  error: null,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUserLoading: (state, action) => {
      state.loading = Boolean(action.payload);
    },
    setUserProfile: (state, action) => {
      state.profile = { ...state.profile, ...action.payload };
      state.loading = false;
      state.error = null;
    },
    updateUserProfile: (state, action) => {
      state.profile = { ...state.profile, ...action.payload };
    },
    setUserError: (state, action) => {
      state.error = action.payload || "Unable to load user profile";
      state.loading = false;
    },
    clearUserProfile: () => initialState,
    clearUserError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setUserLoading,
  setUserProfile,
  updateUserProfile,
  setUserError,
  clearUserProfile,
  clearUserError,
} = userSlice.actions;

export default userSlice.reducer;
