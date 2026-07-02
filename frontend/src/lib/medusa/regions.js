import { getDefaultRegionIdFromEnv } from "../../config/publicEnv";
import apiClient from "../../services/apiClient";

const REGION_STORAGE_KEY = "eatsie_region_id";
const REGION_CONTEXT_STORAGE_KEY = "eatsie_region_context";

/** @type {string | null | undefined} */
let cachedRegionId;
let cachedRegionContext;
let pendingRegionRequest;

/**
 * Resolve the storefront region used for prices, tax, shipping, and cart creation.
 * @returns {Promise<string | null>}
 */
export async function resolveDefaultRegionId() {
  const context = await resolveDefaultRegionContext();
  return context?.region_id || null;
}

/**
 * Resolve the storefront region and currency used for priced requests.
 * @returns {Promise<{ region_id: string, currency_code: string } | null>}
 */
export async function resolveDefaultRegionContext() {
  if (cachedRegionContext?.region_id && cachedRegionContext?.currency_code) {
    return cachedRegionContext;
  }

  if (pendingRegionRequest) return pendingRegionRequest;

  pendingRegionRequest = resolveRegion().finally(() => {
    pendingRegionRequest = undefined;
  });
  return pendingRegionRequest;
}

async function resolveRegion() {
  const storedRegion = localStorage.getItem(REGION_STORAGE_KEY);
  const storedContextRaw = localStorage.getItem(REGION_CONTEXT_STORAGE_KEY);
  let storedContext = null;

  try {
    storedContext = storedContextRaw ? JSON.parse(storedContextRaw) : null;
  } catch {
    storedContext = null;
  }

  try {
    const { regions } = await apiClient.get('/store/regions', {
      params: { limit: 50 },
    });
    
    if (!regions || regions.length === 0) {
      console.warn("No active regions found from Medusa API.");
      return null;
    }

    const validRegionIds = regions.map(r => r.id);
    let resolvedRegion = null;

    if (storedRegion && validRegionIds.includes(storedRegion)) {
      resolvedRegion = regions.find((region) => region.id === storedRegion) || null;
    } else {
      const fromEnv = getDefaultRegionIdFromEnv();
      if (fromEnv && validRegionIds.includes(fromEnv)) {
        resolvedRegion = regions.find((region) => region.id === fromEnv) || null;
      } else {
        resolvedRegion = regions[0]; // Fallback to first available
      }
    }

    if (!resolvedRegion?.id) return null;

    const context = {
      region_id: resolvedRegion.id,
      currency_code: String(resolvedRegion.currency_code || "cad").toLowerCase(),
    };

    cachedRegionId = context.region_id;
    cachedRegionContext = context;
    localStorage.setItem(REGION_STORAGE_KEY, context.region_id);
    localStorage.setItem(REGION_CONTEXT_STORAGE_KEY, JSON.stringify(context));
    
    return context;
  } catch (err) {
    if (storedRegion && (err?.code === "BACKEND_OFFLINE" || err?.response?.status >= 500)) {
      cachedRegionId = storedRegion;
      cachedRegionContext = {
        region_id: storedRegion,
        currency_code: String(storedContext?.currency_code || "cad").toLowerCase(),
      };
      return cachedRegionContext;
    }
    if (err?.code === "BACKEND_OFFLINE") throw err;
    console.warn("Unable to resolve the storefront region:", err?.message || err);
    return null;
  }
}

export function clearRegionCache() {
  cachedRegionId = undefined;
  cachedRegionContext = undefined;
  pendingRegionRequest = undefined;
  localStorage.removeItem(REGION_STORAGE_KEY);
  localStorage.removeItem(REGION_CONTEXT_STORAGE_KEY);
}
