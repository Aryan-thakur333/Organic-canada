import React from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import { STOREFRONT_PRODUCT_CANDIDATE_LIMIT, STOREFRONT_PRODUCT_PAGE_SIZE } from "../constants/storefront-products";
import { buildStorefrontListingPipeline, getPaginationPageNumbers, paginateStorefrontProducts } from "../utils/storefront-listing-pipeline";
import { getStorefrontProductState } from "../utils/storefront-product-state";
import ProductCard from "../components/ProductCard";

const usa = { id: "reg_01KXT623CTGM9NJJYK2G4DQW7E", currency_code: "usd" };
const canada = { id: "reg_01KVJF9HSCYKAZC677GH1AC6C8", currency_code: "cad" };

vi.mock("../hooks/useToast", () => ({
  default: () => ({ showToast: vi.fn() }),
}));

vi.mock("../hooks/useMedusaCart", () => ({
  default: () => ({ addVariant: vi.fn() }),
}));

vi.mock("../config/publicEnv", () => ({
  isMedusaConfigured: () => false,
}));

function product(prices, metadata = {}) {
  return {
    id: "prod_apples",
    title: "Organic Apples",
    metadata,
    variants: [{ id: "variant_apples", calculated_price: prices, manage_inventory: false }],
  };
}

function LocationDisplay() {
  const location = useLocation();
  return React.createElement("span", { "data-testid": "location" }, location.pathname);
}

describe("storefront regional surfaces", () => {
  it("uses one bounded candidate limit", () => {
    expect(STOREFRONT_PRODUCT_CANDIDATE_LIMIT).toBe(200);
    expect(STOREFRONT_PRODUCT_PAGE_SIZE).toBeGreaterThan(0);
  });

  it("keeps exact regional prices without scaling or fallback", () => {
    expect(getStorefrontProductState(product({ calculated_amount: 3.99, currency_code: "usd" }), { region: usa }))
      .toMatchObject({ publicVisible: true, priceAvailable: true, purchasable: true, amount: 3.99, currencyCode: "USD" });
    expect(getStorefrontProductState(product({ calculated_amount: 4.99, currency_code: "cad" }), { region: canada }))
      .toMatchObject({ publicVisible: true, priceAvailable: true, purchasable: true, amount: 4.99, currencyCode: "CAD" });
    expect(getStorefrontProductState(product({ calculated_amount: 4.99, currency_code: "cad" }), { region: usa }))
      .toMatchObject({ priceAvailable: false, purchasable: false, reason: "currency_mismatch" });
  });

  it("hides test/debug products while retaining legitimate empty metadata products", () => {
    expect(getStorefrontProductState(product({ calculated_amount: 3.99, currency_code: "usd" }), { region: usa }).publicVisible).toBe(true);
    expect(getStorefrontProductState(product({ calculated_amount: 3.99, currency_code: "usd" }, { catalog_classification: "test_or_debug_product" }), { region: usa }).publicVisible).toBe(false);
  });

  it("makes zero-priced variants unavailable", () => {
    expect(getStorefrontProductState(product({ calculated_amount: 0, currency_code: "usd" }), { region: usa }))
      .toMatchObject({ priceAvailable: false, purchasable: false });
  });

  it("paginates after filtering so a product after raw index 100 remains reachable", () => {
    const products = Array.from({ length: 125 }, (_, index) => ({ id: `product-${index}` }));
    const page = paginateStorefrontProducts(products, 5, 24);
    expect(page.totalPages).toBe(6);
    expect(page.pageProducts.map((item) => item.id)).toContain("product-100");
  });

  it.each([
    [20, 1, 20],
    [21, 1, 21],
    [24, 1, 24],
    [25, 2, 1],
    [101, 5, 5],
  ])("reports accurate pages and final-page counts for %i eligible products", (count, totalPages, finalPageCount) => {
    const products = Array.from({ length: count }, (_, index) => ({ id: `product-${index}` }));
    const page = paginateStorefrontProducts(products, totalPages, 24);
    expect(page.totalPages).toBe(totalPages);
    expect(page.pageProducts).toHaveLength(finalPageCount);
    expect(page.paginationEnd).toBe(count);
  });

  it("clamps an invalid page after the filtered result shrinks", () => {
    const page = paginateStorefrontProducts([{ id: "only" }], 9, 24);
    expect(page.currentPage).toBe(1);
    expect(page.totalPages).toBe(1);
  });

  it("assigns every eligible product to one reachable page and keeps hidden records out of page slots", () => {
    const eligible = Array.from({ length: 50 }, (_, index) => product({ calculated_amount: index + 1, currency_code: "usd" }));
    const records = eligible.map((item, index) => ({ ...item, id: `eligible-${index}`, title: `Product ${index}` }));
    records.push({ ...product({ calculated_amount: 2, currency_code: "usd" }, { catalog_classification: "test_or_debug_product" }), id: "hidden" });
    records.push({ ...product({ calculated_amount: 2, currency_code: "cad" }), id: "wrong-region" });
    const pipeline = buildStorefrontListingPipeline(records, { region: usa, currentPage: 3, pageSize: 24 });
    expect(pipeline.counts.totalEligibleProducts).toBe(50);
    expect(pipeline.pagination.totalPages).toBe(3);
    expect(pipeline.pagination.pageProducts).toHaveLength(2);
    expect(pipeline.reasonCounts.hiddenByTitleHandleSafeguard + pipeline.reasonCounts.hiddenByMetadata).toBe(1);
    expect(pipeline.reasonCounts.hiddenBecauseNoRegionalPrice).toBe(1);
  });

  it("provides direct reachable page controls without rendering every page for a large catalog", () => {
    expect(getPaginationPageNumbers(1, 8)).toEqual([1, 2, 8]);
    expect(getPaginationPageNumbers(4, 8)).toEqual([1, 3, 4, 5, 8]);
  });

  it("keeps uncategorized eligible products in the All Products filter and resets logical pagination on search", () => {
    const uncategorized = { ...product({ calculated_amount: 3.99, currency_code: "usd" }), id: "uncategorized", categories: [] };
    const other = { ...product({ calculated_amount: 4.99, currency_code: "usd" }), id: "other", title: "Other product" };
    const all = buildStorefrontListingPipeline([uncategorized, other], { region: usa, currentPage: 2, pageSize: 1 });
    expect(all.products.map((item) => item.id)).toContain("uncategorized");
    const searched = buildStorefrontListingPipeline([uncategorized, other], { region: usa, searchQuery: "other", currentPage: 1, pageSize: 24 });
    expect(searched.counts.totalEligibleProducts).toBe(1);
    expect(searched.pagination.pageProducts[0].id).toBe("other");
  });

  it("preserves the selected region slug in product links", async () => {
    const store = configureStore({
      reducer: {
        wishlist: (state = { items: [] }) => state,
        cart: (state = { items: [] }) => state,
      },
    });
    const item = product({ calculated_amount: 3.99, currency_code: "usd" });
    render(
      React.createElement(
        Provider,
        { store },
        React.createElement(
          MemoryRouter,
          { initialEntries: ["/shop/usa"] },
          React.createElement(ProductCard, { item, region: usa, regionSlug: "usa" }),
          React.createElement(LocationDisplay)
        )
      )
    );

    fireEvent.click(screen.getByText("Organic Apples"));

    expect(screen.getByTestId("location")).toHaveTextContent(`/shop/usa/product/${item.id}`);
  });
});
