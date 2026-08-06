import { describe, expect, it } from "vitest";
import { normalizeBarcode } from "./barcode";

describe("normalizeBarcode", () => {
  it("preserves leading zeroes", () => expect(normalizeBarcode("\u00020012345678905\r\n")).toBe("0012345678905"));
  it("rejects an empty code", () => expect(() => normalizeBarcode("\r\n")).toThrow("Enter or scan"));
  it("rejects overlong and non-ASCII codes", () => {
    expect(() => normalizeBarcode("a".repeat(129))).toThrow("too long");
    expect(() => normalizeBarcode("商品")).toThrow("unsupported");
  });
});
