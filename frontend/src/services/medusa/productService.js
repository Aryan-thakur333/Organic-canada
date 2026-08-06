import apiClient, { isRequestCanceled } from "../apiClient";
import { normalizeProductList, normalizeStoreProduct } from "../../lib/medusa/normalize";
import { resolveDefaultRegionId } from "../../lib/medusa/regions";
import { getCustomerToken } from "./tokenStorage";
import { STOREFRONT_PRODUCT_CANDIDATE_LIMIT } from "../../constants/storefront-products";
import { getMedusaPublishableKey } from "../../config/publicEnv";

const PRODUCT_FIELDS = "id,title,handle,description,thumbnail,images.*,variants.*,variants.prices.*,variants.calculated_price.*,categories.*,metadata,type.*";
const PRODUCT_CACHE_PREFIX = "eatsie_products_v1:";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CATEGORY_FIELDS = "id,name,handle,is_active,is_internal";
const PRODUCT_PAGE_SIZE = 100;
const MAX_PRODUCT_PAGES = 50;

const categoryIdByHandle = new Map();

export function buildProductCacheKey(params) {
  return PRODUCT_CACHE_PREFIX + JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
}

function readCachedProducts(params) {
  try {
    const value = JSON.parse(localStorage.getItem(buildProductCacheKey(params)) || "null");
    if (!value?.products || !Array.isArray(value.products)) return null;
    // Expire cache after TTL
    if (value._cachedAt && Date.now() - value._cachedAt > CACHE_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}

function writeCachedProducts(params, response) {
  try {
    localStorage.setItem(buildProductCacheKey(params), JSON.stringify({ ...response, _cachedAt: Date.now() }));
  } catch {
    // Live catalog access still works when browser storage is unavailable.
  }
}

function assertPublishableKeyConfigured() {
  if (!getMedusaPublishableKey()) {
    throw new Error(
      "Storefront configuration is incomplete: publishable API key is missing."
    );
  }
}

function normalizeListResponse(response, params) {
  if (!response || !Array.isArray(response.products)) {
    throw new Error("Invalid Medusa product-list response: expected a products array");
  }

  const requestedOffset = Number(params?.offset ?? 0);
  const requestedLimit = Number(params?.limit ?? response.products.length);

  return {
    products: response.products,
    count: typeof response.count === "number" ? response.count : response.products.length,
    offset: typeof response.offset === "number" ? response.offset : (Number.isFinite(requestedOffset) ? requestedOffset : 0),
    limit: typeof response.limit === "number" ? response.limit : (Number.isFinite(requestedLimit) ? requestedLimit : response.products.length),
    stale: Boolean(response.stale),
  };
}

async function fetchProductPage(params, signal) {
  return normalizeListResponse(
    await apiClient.get("/store/products", { params, signal }),
    params
  );
}

async function fetchAllProductPages(baseParams, signal) {
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let limit = PRODUCT_PAGE_SIZE;
  let stale = false;
  const productsById = new Map();

  for (let page = 0; page < MAX_PRODUCT_PAGES && offset < total; page += 1) {
    if (signal?.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }

    const pageParams = {
      ...baseParams,
      limit: PRODUCT_PAGE_SIZE,
      offset,
    };
    const response = await fetchProductPage(pageParams, signal);
    total = response.count;
    limit = response.limit || PRODUCT_PAGE_SIZE;
    stale = stale || response.stale;

    for (const product of response.products) {
      if (product?.id) {
        productsById.set(product.id, product);
      }
    }

    if (response.products.length === 0) {
      break;
    }

    offset += response.products.length;
  }

  return {
    products: Array.from(productsById.values()),
    count: Number.isFinite(total) ? total : productsById.size,
    offset: 0,
    limit,
    stale,
  };
}

/**
 * Bust all product listing cache entries so the next fetch returns fresh data.
 * Call this after creating or updating products in the admin.
 */
export function invalidateProductCache() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PRODUCT_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {
    // Ignore storage errors
  }
}

export const productService = {
  list: async (params = {}) => {
    const {
      category_handle,
      region_id: requestedRegionId,
      currency_code: _currencyCode,
      signal,
      force_refresh,
      fetch_all_pages,
      ...restParams
    } = params;
    assertPublishableKeyConfigured();
    const regionId = requestedRegionId || await resolveDefaultRegionId();
    if (!regionId) {
      return { products: [], count: 0 };
    }

    const categoryId = category_handle
      ? await productService.resolveCategoryIdByHandle(category_handle)
      : null;

    if (category_handle && !categoryId) {
      return { products: [], count: 0 };
    }

    const requestParams = {
        fields: PRODUCT_FIELDS,
        // Public listing filters test and region-unavailable records client-side.
        // Fetch a bounded complete candidate set so hidden earlier records do not
        // consume the slots for legitimate older products.
        limit: STOREFRONT_PRODUCT_CANDIDATE_LIMIT,
        order: "-created_at",
        region_id: regionId,
        ...restParams,
        ...(categoryId ? { category_id: [categoryId] } : {}),
    };
    const hasCustomerContext = Boolean(getCustomerToken());

    try {
      const response = fetch_all_pages
        ? await fetchAllProductPages(requestParams, signal)
        : await apiClient.get("/store/products", { params: requestParams, signal });
      // Always write fresh data; skip only when customer is authenticated (pricing is personalised)
      if (!hasCustomerContext) {
        writeCachedProducts(requestParams, response);
      }
      return response;
    } catch (error) {
      // Serve stale cache only on network/server failures, not on force_refresh
      const cached = (hasCustomerContext || force_refresh) ? null : readCachedProducts(requestParams);
      if (cached && (error?.code === "BACKEND_OFFLINE" || error?.response?.status >= 500)) {
        return { ...cached, stale: true };
      }
      throw error;
    }
  },
    
  retrieve: async (id, params = {}) => {
    const { region_id: requestedRegionId, currency_code: _currencyCode, signal, ...restParams } = params;
    assertPublishableKeyConfigured();
    const regionId = requestedRegionId || await resolveDefaultRegionId();
    if (!regionId) {
      throw new Error("Store is currently unavailable in your region.");
    }
    return apiClient.get(`/store/products/${id}`, { 
      params: { 
        fields: PRODUCT_FIELDS,
        region_id: regionId,
        ...restParams
      },
      signal
    });
  },

  listCategories: (params = {}) =>
    apiClient.get("/store/product-categories", {
      params: {
        fields: CATEGORY_FIELDS,
        limit: 100,
        ...params,
      },
    }),

  resolveCategoryIdByHandle: async (handle) => {
    const normalizedHandle = String(handle || "").trim().toLowerCase();
    if (!normalizedHandle) return null;
    if (categoryIdByHandle.has(normalizedHandle)) {
      return categoryIdByHandle.get(normalizedHandle);
    }

    const { product_categories = [] } = await productService.listCategories({
      handle: normalizedHandle,
    });
    const category = product_categories.find(
      (item) => item?.handle?.toLowerCase() === normalizedHandle
    );
    const id = category?.id || null;
    categoryIdByHandle.set(normalizedHandle, id);
    return id;
  },
};

// Backward compatibility
export const listStoreProducts = async (opts = {}) => {
  try {
    const response = normalizeListResponse(await productService.list(opts), opts);
    const regionId = opts.region_id || null;
    return {
      ...response,
      products: normalizeProductList(response.products, regionId),
    };
  } catch (error) {
    if (isRequestCanceled(error)) {
      throw error;
    }

    console.error("[listStoreProducts] Request failed", {
      message: error?.message,
      status: error?.response?.status,
      data: error?.response?.data,
      params: opts,
    });

    throw error;
  }
};

export const retrieveStoreProduct = async (id, opts = {}) => {
  const { product } = await productService.retrieve(id, opts);
  return normalizeStoreProduct(product, opts.region_id || null);
};
