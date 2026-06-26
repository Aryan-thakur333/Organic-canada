import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Provider } from "react-redux";
import { store } from "./redux/store";
import { Toaster } from "react-hot-toast";
import AuthSync from "./components/common/AuthSync";
import CartBootstrap from "./components/common/CartBootstrap";
import { ThemeProvider } from "./hooks/useTheme";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <AuthSync />
        <CartBootstrap />
        <App />
        <Toaster position="top-right" reverseOrder={false} />
      </ThemeProvider>
    </Provider>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}
