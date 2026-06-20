/* global process */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
const medusaTarget = process.env.VITE_PROXY_MEDUSA_TARGET || "http://localhost:9000";

const checkoutTarget = process.env.VITE_PROXY_CHECKOUT_TARGET || "http://localhost:4242";

const proxy = {
  "/store": { target: medusaTarget, changeOrigin: true },
  "/auth": { target: medusaTarget, changeOrigin: true },
  "/admin": { target: medusaTarget, changeOrigin: true },
  "/static": { target: medusaTarget, changeOrigin: true },
  "/api/v1": {
    target: checkoutTarget,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ""),
  },
  "/api/payment": {
    target: "http://localhost:4242",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/payment/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { 
    proxy,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
  preview: { 
    proxy,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
});
