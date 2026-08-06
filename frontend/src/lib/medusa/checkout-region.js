const normalizeCountryCode = (value) => String(value || "").trim().toLowerCase();

export function getCheckoutRegionCountries(cart) {
  const countries = Array.isArray(cart?.region?.countries) ? cart.region.countries : [];
  return countries.map((country) => ({
    iso_2: normalizeCountryCode(country?.iso_2),
    display_name: String(country?.display_name || country?.name || country?.iso_2 || "").trim(),
  })).filter((country) => country.iso_2 && country.display_name);
}

export function resolveCheckoutCountry(countries, currentCountry) {
  const current = normalizeCountryCode(currentCountry);
  if (countries.some((country) => country.iso_2 === current)) return current;
  return countries.length === 1 ? countries[0].iso_2 : "";
}

export function normalizeCheckoutPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/(?!^)\+/g, "").replace(/[^+\d]/g, "");
  return normalized.startsWith("+") ? normalized : normalized.replace(/^0+/, "");
}

export function validateCheckoutShippingAddress(formData, countries) {
  if (!Array.isArray(countries) || countries.length === 0) return { valid: false, code: "CHECKOUT_REGION_COUNTRIES_NOT_CONFIGURED", message: "Shipping countries are not configured for this store region." };
  const required = ["first_name", "last_name", "email", "address", "city", "province", "postal_code", "country_code"];
  if (required.some((field) => !String(formData?.[field] || "").trim())) return { valid: false, code: "CHECKOUT_ADDRESS_REQUIRED", message: "Please complete all required shipping details." };
  const countryCode = normalizeCountryCode(formData.country_code);
  if (!countries.some((country) => country.iso_2 === countryCode)) return { valid: false, code: "CHECKOUT_COUNTRY_NOT_ALLOWED_FOR_REGION", message: "The selected country is not available for this store region. Select a valid shipping country." };
  return { valid: true, country_code: countryCode };
}

export function getCheckoutErrorMessage(error, regionName = "selected") {
  const message = String(error?.response?.data?.message || error?.message || "");
  if (/Country with code\s+\w+\s+is not within region/i.test(message)) return `The selected country is not available for the ${regionName} store. Select a valid ${regionName} shipping country.`;
  return message || "Unable to save shipping details.";
}
