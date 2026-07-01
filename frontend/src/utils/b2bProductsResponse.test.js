import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractB2BQuotes,
  extractB2BProducts,
  extractB2BResponseMeta,
  extractB2BMeta,
} from "./b2bProductsResponse";

// ── Sample data ─────────────────────────────────────────────────────────────

const mockQuotes = [
  { id: "quote_1", status: "pending", subtotal: 5000 },
  { id: "quote_2", status: "approved", subtotal: 10000 },
];

const mockProducts = [
  { id: "prod_1", title: "Product A" },
  { id: "prod_2", title: "Product B" },
];

// ── extractB2BQuotes ─────────────────────────────────────────────────────────

describe("extractB2BQuotes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts quotes from response.quotes (direct shape)", () => {
    const result = extractB2BQuotes({ quotes: mockQuotes });
    expect(result).toEqual(mockQuotes);
  });

  it("extracts quotes from response.data.quotes (axios unwrapped)", () => {
    const result = extractB2BQuotes({ data: { quotes: mockQuotes } });
    expect(result).toEqual(mockQuotes);
  });

  it("extracts quotes from response.data.data.quotes (nested)", () => {
    const result = extractB2BQuotes({
      data: { data: { quotes: mockQuotes } },
    });
    expect(result).toEqual(mockQuotes);
  });

  it("extracts quotes from response.items (alternative field)", () => {
    const result = extractB2BQuotes({ items: mockQuotes });
    expect(result).toEqual(mockQuotes);
  });

  it("extracts quotes from response.data.items (nested alternative)", () => {
    const result = extractB2BQuotes({ data: { items: mockQuotes } });
    expect(result).toEqual(mockQuotes);
  });

  it("returns empty array for null response", () => {
    expect(extractB2BQuotes(null)).toEqual([]);
  });

  it("returns empty array for undefined response", () => {
    expect(extractB2BQuotes(undefined)).toEqual([]);
  });

  it("returns empty array for empty object", () => {
    expect(extractB2BQuotes({})).toEqual([]);
  });

  it("prefers quotes over items when both exist", () => {
    // First matched candidate wins — quotes comes before items
    const result = extractB2BQuotes({
      quotes: mockQuotes,
      items: [{ id: "item_1" }],
    });
    expect(result).toEqual(mockQuotes);
  });

  it("prefers direct quotes over nested quotes", () => {
    const result = extractB2BQuotes({
      quotes: mockQuotes.slice(0, 1),
      data: { quotes: mockQuotes },
    });
    expect(result).toEqual(mockQuotes.slice(0, 1));
  });

  it("returns empty array when no quotes or items field exists", () => {
    expect(extractB2BQuotes({ something: "else" })).toEqual([]);
  });

  it("returns empty array when quotes field is not an array", () => {
    expect(extractB2BQuotes({ quotes: "not-an-array" })).toEqual([]);
  });

  it("returns empty array when data.quotes field is not an array", () => {
    expect(extractB2BQuotes({ data: { quotes: "not-an-array" } })).toEqual([]);
  });

  it("handles response with count and quotes (real-world shape)", () => {
    const result = extractB2BQuotes({ quotes: mockQuotes, count: 2 });
    expect(result).toEqual(mockQuotes);
    expect(result).toHaveLength(2);
  });
});

// ── extractB2BProducts ───────────────────────────────────────────────────────

describe("extractB2BProducts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Silence console.warn in tests that intentionally trigger it
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("extracts products from response.products", () => {
    const result = extractB2BProducts({ products: mockProducts });
    expect(result).toEqual(mockProducts);
  });

  it("extracts products from response.data.products", () => {
    const result = extractB2BProducts({ data: { products: mockProducts } });
    expect(result).toEqual(mockProducts);
  });

  it("extracts products from response.data.data.products", () => {
    const result = extractB2BProducts({
      data: { data: { products: mockProducts } },
    });
    expect(result).toEqual(mockProducts);
  });

  it("extracts products from response.data.result.products", () => {
    const result = extractB2BProducts({
      data: { result: { products: mockProducts } },
    });
    expect(result).toEqual(mockProducts);
  });

  it("extracts products from response.result.products", () => {
    const result = extractB2BProducts({
      result: { products: mockProducts },
    });
    expect(result).toEqual(mockProducts);
  });

  it("returns the response itself if it is an array", () => {
    const result = extractB2BProducts(mockProducts);
    expect(result).toEqual(mockProducts);
  });

  it("returns empty array for null", () => {
    expect(extractB2BProducts(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(extractB2BProducts(undefined)).toEqual([]);
  });

  it("returns empty array for empty object", () => {
    expect(extractB2BProducts({})).toEqual([]);
  });

  it("warns when response has no recognizable shape", () => {
    extractB2BProducts({ unknown: "shape" });
    expect(console.warn).toHaveBeenCalledWith(
      "[extractB2BProducts] Could not extract products from response",
      expect.any(Object)
    );
  });
});

// ── extractB2BResponseMeta ───────────────────────────────────────────────────

describe("extractB2BResponseMeta", () => {
  it("returns response.data when data is an object", () => {
    const data = { count: 5, products: [] };
    const result = extractB2BResponseMeta({ data });
    expect(result).toBe(data);
  });

  it("returns response itself when no data property (already unwrapped)", () => {
    const response = { count: 5, products: [] };
    const result = extractB2BResponseMeta(response);
    expect(result).toBe(response);
  });

  it("returns response itself when data is an array", () => {
    const response = { data: [1, 2, 3] };
    const result = extractB2BResponseMeta(response);
    expect(result).toBe(response);
  });

  it("returns null for null", () => {
    expect(extractB2BResponseMeta(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(extractB2BResponseMeta(undefined)).toBeNull();
  });
});

// ── extractB2BMeta ───────────────────────────────────────────────────────────

describe("extractB2BMeta", () => {
  it("extracts count from response.count", () => {
    expect(extractB2BMeta({ count: 10 }).count).toBe(10);
  });

  it("extracts count from response.data.count", () => {
    expect(extractB2BMeta({ data: { count: 20 } }).count).toBe(20);
  });

  it("extracts count from response.data.data.count", () => {
    expect(extractB2BMeta({ data: { data: { count: 30 } } }).count).toBe(30);
  });

  it("defaults count to 0", () => {
    expect(extractB2BMeta({}).count).toBe(0);
  });

  it("extracts price_list from response.price_list", () => {
    const pl = { id: "pl_1" };
    expect(extractB2BMeta({ price_list: pl }).price_list).toBe(pl);
  });

  it("extracts price_list from nested data shapes", () => {
    const pl = { id: "pl_1" };
    expect(extractB2BMeta({ data: { price_list: pl } }).price_list).toBe(pl);
  });

  it("extracts company from response.company", () => {
    const company = { id: "comp_1" };
    expect(extractB2BMeta({ company }).company).toBe(company);
  });

  it("extracts debug info from response.debug", () => {
    const debug = { sql: "SELECT..." };
    expect(extractB2BMeta({ debug }).debug).toBe(debug);
  });

  it("defaults price_list, company, debug to null", () => {
    const meta = extractB2BMeta({});
    expect(meta.price_list).toBeNull();
    expect(meta.company).toBeNull();
    expect(meta.debug).toBeNull();
  });

  it("returns an object with all keys present", () => {
    const meta = extractB2BMeta({ count: 5, price_list: "pl1", company: "c1", debug: "d1" });
    expect(meta).toEqual({
      count: 5,
      price_list: "pl1",
      company: "c1",
      debug: "d1",
    });
  });
});
