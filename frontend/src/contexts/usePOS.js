import { createContext, useContext } from "react";

// The context object and hook live outside POSContext.jsx so that the provider
// module exports only the component (Fast Refresh compatible). Hooks/contexts
// in a non-component module are intentionally not hot-refreshed; they reload
// the module instead.
export const POSContext = createContext(null);

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) throw new Error("usePOS must be used inside POSProvider");
  return context;
}
