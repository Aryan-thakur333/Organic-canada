export const DEFAULT_REGION_SLUG = "usa";

export const REGION_SLUG_CONFIG = {
  usa: {
    name: "United States",
    label: "United States",
    currencyCode: "usd",
    countryCode: "us",
    expectedRegionId: "reg_01KXT623CTGM9NJJYK2G4DQW7E",
  },
  canada: {
    name: "Canada",
    label: "Canada",
    currencyCode: "cad",
    countryCode: "ca",
    expectedRegionId: "reg_01KVJF9HSCYKAZC677GH1AC6C8",
  },
};

export const REGION_SLUGS = Object.keys(REGION_SLUG_CONFIG);

export function normalizeRegionSlug(slug) {
  return String(slug || "").trim().toLowerCase();
}

export function isKnownRegionSlug(slug) {
  return Boolean(REGION_SLUG_CONFIG[normalizeRegionSlug(slug)]);
}

export function getRegionSlugForRegion(region) {
  const regionId = String(region?.id || "");
  const currencyCode = String(region?.currency_code || "").toLowerCase();
  return (
    REGION_SLUGS.find(
      (slug) =>
        REGION_SLUG_CONFIG[slug].expectedRegionId === regionId &&
        REGION_SLUG_CONFIG[slug].currencyCode === currencyCode
    ) || null
  );
}

function regionHasCountry(region, countryCode) {
  const expected = String(countryCode || "").toLowerCase();
  if (!expected) return true;
  const countries = Array.isArray(region?.countries) ? region.countries : [];
  return countries.some((country) => String(country?.iso_2 || "").toLowerCase() === expected);
}

export function resolveRegionBySlug(slug, regions) {
  const normalizedSlug = normalizeRegionSlug(slug);
  const config = REGION_SLUG_CONFIG[normalizedSlug];
  if (!config || !Array.isArray(regions)) return undefined;

  const currencyCode = config.currencyCode.toLowerCase();
  return regions.find(
    (region) =>
      String(region?.id || "") === config.expectedRegionId &&
      String(region?.currency_code || "").toLowerCase() === currencyCode &&
      regionHasCountry(region, config.countryCode)
  );
}
