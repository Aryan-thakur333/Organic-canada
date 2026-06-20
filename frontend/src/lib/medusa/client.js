import Medusa from "@medusajs/js-sdk";
import {
  getMedusaBackendUrl,
  getMedusaPublishableKey,
  isMedusaConfigured,
} from "../../config/publicEnv";

/** @type {import("@medusajs/js-sdk").default | null} */
let sdk = null;

/**
 * Lazily construct the Medusa JS SDK. Uses publishable key + optional JWT from local storage.
 * @returns {import("@medusajs/js-sdk").default}
 */
export function getMedusaSdk() {
  if (sdk) return sdk;

  const baseUrl = getMedusaBackendUrl() || "http://localhost:9000";
  const publishableKey = getMedusaPublishableKey();

  sdk = new Medusa({
    baseUrl,
    publishableKey: publishableKey || "pk_missing_configure_env",
    debug: import.meta.env.DEV,
    auth: {
      type: "jwt",
      jwtTokenStorageMethod: "local",
      jwtStorageKey: "medusa_token",
    },
  });

  return sdk;
}

/** @internal testing / re-login */
export function resetMedusaSdkForTests() {
  sdk = null;
}

export { isMedusaConfigured };
