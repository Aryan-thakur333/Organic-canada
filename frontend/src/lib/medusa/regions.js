import { getDefaultRegionIdFromEnv } from "../../config/publicEnv";
import apiClient from "../../services/apiClient";

const REGION_STORAGE_KEY = "eatsie_region_id";

/** @type {string | null | undefined} */
let cachedRegionId;
let pendingRegionRequest;

/**
 * Resolve the storefront region used for prices, tax, shipping, and cart creation.
 * @returns {Promise<string | null>}
 */
export async function resolveDefaultRegionId() {
  if (cachedRegionId) return cachedRegionId;
  if (pendingRegionRequest) return pendingRegionRequest;

  pendingRegionRequest = resolveRegion().finally(() => {
    pendingRegionRequest = undefined;
  });
  return pendingRegionRequest;
}

async function resolveRegion() {
  const storedRegion = localStorage.getItem(REGION_STORAGE_KEY);
  try {
    const { regions } = await apiClient.get('/store/regions', {
      params: { limit: 50 },
    });
    
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
    if (storedRegion && (err?.code === "BACKEND_OFFLINE" || err?.response?.status >= 500)) {
      cachedRegionId = storedRegion;
      return storedRegion;
    }
    if (err?.code === "BACKEND_OFFLINE") throw err;
    console.warn("Unable to resolve the storefront region:", err?.message || err);
    return null;
  }
}

export function clearRegionCache() {
  cachedRegionId = undefined;
  pendingRegionRequest = undefined;
  localStorage.removeItem(REGION_STORAGE_KEY);
}
