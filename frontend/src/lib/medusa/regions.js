import { getMedusaSdk } from "./client";
import { getDefaultRegionIdFromEnv } from "../../config/publicEnv";

const REGION_STORAGE_KEY = "eatsie_region_id";

/** @type {string | null | undefined} */
let cachedRegionId;

/**
 * Resolve the storefront region used for prices, tax, shipping, and cart creation.
 * @returns {Promise<string | null>}
 */
export async function resolveDefaultRegionId() {
  try {
    if (cachedRegionId) return cachedRegionId;

    const storedRegion = localStorage.getItem(REGION_STORAGE_KEY);
    const sdk = getMedusaSdk();
    const { regions } = await sdk.store.region.list({ limit: 50 });
    
    if (!regions || regions.length === 0) {
      console.warn("No active regions found from Medusa API.");
      return null;
    }

    const validRegionIds = regions.map(r => r.id);
    let resolvedRegionId = null;

    if (storedRegion && validRegionIds.includes(storedRegion)) {
      resolvedRegionId = storedRegion;
    } else {
      const fromEnv = getDefaultRegionIdFromEnv();
      if (fromEnv && validRegionIds.includes(fromEnv)) {
        resolvedRegionId = fromEnv;
      } else {
        resolvedRegionId = regions[0].id; // Fallback to first available
      }
    }

    cachedRegionId = resolvedRegionId;
    localStorage.setItem(REGION_STORAGE_KEY, resolvedRegionId);
    
    return resolvedRegionId;
  } catch (err) {
    console.error("[resolveDefaultRegionId] failed:", err);
    return null;
  }
}

export function clearRegionCache() {
  cachedRegionId = undefined;
  localStorage.removeItem(REGION_STORAGE_KEY);
}
