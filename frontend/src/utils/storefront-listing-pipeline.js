import { getDisplayPrice } from "./pricing";
import { getStorefrontProductState } from "./storefront-product-state";
import { getStorefrontProductVisibility } from "./storefront-product-visibility";

export function isDigitalStorefrontProduct(product) {
  const metadata = product?.metadata || {};
  return metadata.is_digital === true
    || metadata.is_digital === "true"
    || product?.type?.value === "Digital Product";
}

export function paginateStorefrontProducts(products, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginationStart = (currentPage - 1) * pageSize;
  const paginationEnd = Math.min(paginationStart + pageSize, products.length);

  return {
    currentPage,
    totalPages,
    paginationStart,
    paginationEnd,
    pageProducts: products.slice(paginationStart, paginationEnd),
  };
}

/**
 * The listing deliberately filters the bounded Store API candidate set before
 * sorting and pagination. This keeps hidden or wrong-region records out of
 * public page slots without mutating the fetched response array.
 */
export function buildStorefrontListingPipeline(rawProducts, {
  region,
  searchQuery = "",
  productTypeFilter = "all",
  sortBy = "newest",
  currentPage = 1,
  pageSize = 24,
} = {}) {
  const products = Array.isArray(rawProducts) ? rawProducts : [];
  const reasonCounts = {
    hiddenByMetadata: 0,
    hiddenByTitleHandleSafeguard: 0,
    hiddenBecauseNoRegionalPrice: 0,
    hiddenBecauseZeroPrice: 0,
    hiddenBecauseInventory: 0,
    hiddenBecauseCategory: 0,
    hiddenBecauseBusinessFilter: 0,
    hiddenBecauseCardReturnedNull: 0,
  };

  const analyzed = products.map((product) => {
    const visibility = getStorefrontProductVisibility(product);
    const state = getStorefrontProductState(product, { region });
    if (!visibility.visible) {
      if (visibility.reason === "catalog_metadata") reasonCounts.hiddenByMetadata += 1;
      else reasonCounts.hiddenByTitleHandleSafeguard += 1;
    } else if (!state.priceAvailable) {
      reasonCounts.hiddenBecauseNoRegionalPrice += 1;
      if (state.reason === "INVALID_AMOUNT" || state.reason === "malformed_price") {
        reasonCounts.hiddenBecauseZeroPrice += 1;
      }
    }
    return { product, visibility, state };
  });

  const publicRecords = analyzed.filter(({ visibility }) => visibility.visible);
  const regionPriceRecords = publicRecords.filter(({ state }) => state.priceAvailable);
  const inventoryEligibleCount = regionPriceRecords.filter(({ state }) => state.inventoryAvailable).length;
  // Out-of-stock products remain discoverable. Inventory blocks cart actions,
  // not catalog discovery, so this stage does not exclude them.
  const businessRecords = regionPriceRecords;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchRecords = businessRecords.filter(({ product }) => {
    if (!normalizedSearch) return true;
    return String(product?.title || "").toLowerCase().includes(normalizedSearch)
      || String(product?.description || "").toLowerCase().includes(normalizedSearch);
  });
  const typeRecords = searchRecords.filter(({ product }) => {
    if (productTypeFilter === "digital") return isDigitalStorefrontProduct(product);
    if (productTypeFilter === "physical") return !isDigitalStorefrontProduct(product);
    return true;
  });

  reasonCounts.hiddenBecauseBusinessFilter = businessRecords.length - typeRecords.length;
  const sortedProducts = [...typeRecords.map(({ product }) => product)].sort((a, b) => {
    if (sortBy === "price-low") {
      return (getDisplayPrice(a, { region }).amount ?? Number.MAX_SAFE_INTEGER)
        - (getDisplayPrice(b, { region }).amount ?? Number.MAX_SAFE_INTEGER);
    }
    if (sortBy === "price-high") {
      return (getDisplayPrice(b, { region }).amount ?? -1)
        - (getDisplayPrice(a, { region }).amount ?? -1);
    }
    if (sortBy === "title") return String(a?.title || "").localeCompare(String(b?.title || ""));
    return 0;
  });
  const pagination = paginateStorefrontProducts(sortedProducts, currentPage, pageSize);

  return {
    products: sortedProducts,
    pagination,
    counts: {
      rawApiCount: products.length,
      publicVisibilityCount: publicRecords.length,
      hiddenTestDebugCount: products.length - publicRecords.length,
      activeRegionPriceAvailableCount: regionPriceRecords.length,
      unavailableRegionPriceCount: publicRecords.length - regionPriceRecords.length,
      inventoryEligibleCount,
      businessFilterEligibleCount: businessRecords.length,
      categoryFilteredCount: 0,
      searchFilteredCount: businessRecords.length - searchRecords.length,
      sortedCount: sortedProducts.length,
      totalEligibleProducts: sortedProducts.length,
      pageSize,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      paginationStart: pagination.paginationStart,
      paginationEnd: pagination.paginationEnd,
      displayedCount: pagination.pageProducts.length,
    },
    reasonCounts,
    analyzed,
  };
}

export function getPaginationPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
}
