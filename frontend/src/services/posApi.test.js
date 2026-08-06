import { describe, expect, it } from "vitest";
import { normalizeBootstrapResponse, normalizeRegisterResponse } from "./posApi";

const register = {
  id: "register_us",
  name: "USA POS Register",
  code: "US-POS-01",
  currency_code: "usd",
  status: "active",
};

describe("POS API register response normalization", () => {
  it("accepts the canonical { registers } response shape", () => {
    const normalized = normalizeRegisterResponse({ registers: [register] });
    expect(normalized).toEqual([register]);
    expect(normalized.__rawRegisterCount).toBe(1);
    expect(normalized.__normalizedRegisterCount).toBe(1);
  });

  it("accepts Axios-style { data: { registers } } response shape", () => {
    const normalized = normalizeRegisterResponse({ data: { registers: [register] } });
    expect(normalized).toEqual([register]);
    expect(normalized.__rawRegisterCount).toBe(1);
    expect(normalized.__normalizedRegisterCount).toBe(1);
  });

  it("normalizes the atomic bootstrap contract", () => {
    expect(normalizeBootstrapResponse({ authenticated: true, operator: { id: "operator_1" }, registers: [register], assignment_state: "ready", session: null })).toMatchObject({ operator: { id: "operator_1" }, registers: [register], session: null });
  });
});
