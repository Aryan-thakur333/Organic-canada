import apiClient from "../apiClient";
import { normalizeProductList, normalizeStoreProduct } from "../../lib/medusa/normalize";
import { resolveDefaultRegionId } from "../../lib/medusa/regions";

const PRODUCT_FIELDS = "id,title,handle,description,thumbnail,images.*,variants.*,variants.prices.*,variants.calculated_price.*,categories.*";
const PRODUCT_CACHE_PREFIX = "eatsie_products_v1:";
const CATEGORY_FIELDS = "id,name,handle,is_active,is_internal";

const categoryIdByHandle = new Map();

function cacheKey(params) {
  return PRODUCT_CACHE_PREFIX + JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
}

function readCachedProducts(params) {
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey(params)) || "null");
    return value?.products && Array.isArray(value.products) ? value : null;
  } catch {
    return null;
  }
}

function writeCachedProducts(params, response) {
  try {
    localStorage.setItem(cacheKey(params), JSON.stringify(response));
  } catch {
    // Live catalog access still works when browser storage is unavailable.
  }
}

export const productService = {
  list: async (params = {}) => {
    const regionId = await resolveDefaultRegionId();
    if (!regionId) {
      return { products: [], count: 0 };
    }

    const { category_handle, ...restParams } = params;
    const categoryId = category_handle
      ? await productService.resolveCategoryIdByHandle(category_handle)
      : null;

    if (category_handle && !categoryId) {
      return { products: [], count: 0 };
    }

    const requestParams = {
        fields: PRODUCT_FIELDS,
        limit: 100,
        region_id: regionId,
        ...restParams,
        ...(categoryId ? { category_id: [categoryId] } : {}),
    };
    try {
      const response = await apiClient.get("/store/products", { params: requestParams });
      writeCachedProducts(requestParams, response);
      return response;
    } catch (error) {
      const cached = readCachedProducts(requestParams);
      if (cached && (error?.code === "BACKEND_OFFLINE" || error?.response?.status >= 500)) {
        return { ...cached, stale: true };
      }
      throw error;
    }
  },
    
  retrieve: async (id, params = {}) => {
    const regionId = await resolveDefaultRegionId();
    if (!regionId) {
      throw new Error("Store is currently unavailable in your region.");
    }
    return apiClient.get(`/store/products/${id}`, { 
      params: { 
        fields: PRODUCT_FIELDS,
        region_id: regionId,
        ...params 
      } 
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
  const { products, count } = await productService.list(opts);
  return { 
    products: normalizeProductList(products), 
    count: Number(count) 
  };
};

export const retrieveStoreProduct = async (id) => {
  const { product } = await productService.retrieve(id);
  return normalizeStoreProduct(product);
};
