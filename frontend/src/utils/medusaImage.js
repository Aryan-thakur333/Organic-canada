import { getMedusaBackendUrl } from "../config/publicEnv";

/**
 * Absolute URL for product imagery (Medusa often returns `/static/...` relative to the API host).
 * In Vite dev, same-origin `/static` is proxied to Medusa.
 */
export const PRODUCT_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80";
function medusaPublicBase() {
  const explicit = import.meta.env.VITE_MEDUSA_PUBLIC_URL;
  if (explicit && String(explicit).trim()) return String(explicit).replace(/\/$/, "");
  const base = getMedusaBackendUrl();
  if (base) return base.replace(/\/$/, "");
  return "";
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function resolveMedusaImageUrl(raw) {
  if (raw == null) return PRODUCT_IMAGE_FALLBACK;
  const s = String(raw).trim();
  if (!s) return PRODUCT_IMAGE_FALLBACK;
  if (/^https?:\/\//i.test(s)) return s;
  const base = medusaPublicBase();
  const path = s.startsWith("/") ? s : `/${s}`;
  if (base) return `${base}${path}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/**
 * @param {Record<string, unknown>} product
 * @returns {string | null}
 */
export function pickProductImageRaw(product) {
  if (!product || typeof product !== "object") return null;
  const thumb = product.thumbnail;
  if (typeof thumb === "string" && thumb.trim()) return thumb.trim();
  const imgs = product.images;
  if (Array.isArray(imgs) && imgs.length) {
    const first = imgs[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object" && typeof first.url === "string") return first.url.trim();
  }
  return null;
}
