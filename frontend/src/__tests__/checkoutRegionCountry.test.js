import { describe, expect, it } from "vitest";
import { getCheckoutErrorMessage, getCheckoutRegionCountries, resolveCheckoutCountry, validateCheckoutShippingAddress } from "../lib/medusa/checkout-region";
import { buildMedusaAddress } from "../services/medusa/checkoutService";

const usaCart = { region: { name: "USA", countries: [{ iso_2: "us", display_name: "United States" }] } };
const canadaCart = { region: { name: "Canada", countries: [{ iso_2: "ca", display_name: "Canada" }] } };
const address = (country_code) => ({ first_name: "A", last_name: "Customer", email: "a@example.com", address: "1 Test Way", city: "Seattle", province: "WA", postal_code: "98101", country_code });

describe("region-driven checkout shipping", () => {
  it("defaults a single-country USA or Canada cart from cart.region.countries", () => {
    expect(resolveCheckoutCountry(getCheckoutRegionCountries(usaCart), "")).toBe("us");
    expect(resolveCheckoutCountry(getCheckoutRegionCountries(canadaCart), "")).toBe("ca");
  });

  it("removes a stale Canada selection when the cart changes to USA", () => {
    expect(resolveCheckoutCountry(getCheckoutRegionCountries(usaCart), "ca")).toBe("us");
  });

  it("prevents an invalid country from reaching cart update", () => {
    expect(validateCheckoutShippingAddress(address("ca"), getCheckoutRegionCountries(usaCart))).toMatchObject({ valid: false, code: "CHECKOUT_COUNTRY_NOT_ALLOWED_FOR_REGION" });
    expect(validateCheckoutShippingAddress(address("us"), getCheckoutRegionCountries(usaCart))).toMatchObject({ valid: true, country_code: "us" });
  });

  it("builds an exact lowercase address payload rather than using a default country", () => {
    expect(buildMedusaAddress({ firstName: "A", lastName: "Customer", address1: "1 Test Way", city: "Seattle", province: "WA", postalCode: "98101", countryCode: "US" })).toMatchObject({ country_code: "us", province: "WA" });
  });

  it("maps Medusa's country error to a precise safe message", () => {
    expect(getCheckoutErrorMessage(new Error("Country with code ca is not within region USA"), "USA")).toContain("USA store");
  });
});
