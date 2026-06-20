import apiClient from "../apiClient";
import { normalizeProductList, normalizeStoreProduct } from "../../lib/medusa/normalize";
import { resolveDefaultRegionId } from "../../lib/medusa/regions";

const PRODUCT_FIELDS = "id,title,handle,description,thumbnail,images.*,variants.*,variants.prices.*,variants.calculated_price.*,categories.*";

export const productService = {
  list: async (params = {}) => {
    const regionId = await resolveDefaultRegionId();
    if (!regionId) {
      console.warn("No region found. Returning empty products.");
      return { products: [], count: 0 };
    }
    return apiClient.get("/store/products", { 
      params: { 
        fields: PRODUCT_FIELDS,
        limit: 100,
        region_id: regionId,
        ...params 
      } 
    });
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
    apiClient.get("/store/product-categories", { params }),
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
