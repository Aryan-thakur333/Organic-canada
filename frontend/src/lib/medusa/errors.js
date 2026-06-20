import { FetchError } from "@medusajs/js-sdk";

/**
 * @param {unknown} err
 * @param {string} [fallback]
 * @returns {string}
 */
export function getSdkErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (err instanceof FetchError) {
    return err.message || fallback;
  }
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return fallback;
}
