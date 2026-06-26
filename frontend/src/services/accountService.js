import apiClient from "./apiClient";

export const accountService = {
  getAccountType: async (email) => {
    const response = await apiClient.post("/vendor/account-type", {
      email: String(email || "").trim().toLowerCase(),
    });
    return response?.account_type || "customer";
  },
};
