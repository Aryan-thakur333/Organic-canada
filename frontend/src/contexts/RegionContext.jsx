import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { regionService } from "../services/medusa/regionService";
import {
  DEFAULT_REGION_SLUG,
  isKnownRegionSlug,
  normalizeRegionSlug,
  REGION_SLUG_CONFIG,
  resolveRegionBySlug,
} from "../lib/medusa/regionSlugs";
import { setResolvedRegionContext } from "../lib/medusa/regions";

const RegionContext = createContext(null);

const REGION_SLUG_STORAGE_KEY = "eatsie_region_slug";

function getSlugFromPath(pathname) {
  const match = String(pathname || "").match(/^\/shop\/([^/?#]+)/);
  return match ? normalizeRegionSlug(match[1]) : null;
}

function readStoredSlug() {
  try {
    return normalizeRegionSlug(localStorage.getItem(REGION_SLUG_STORAGE_KEY));
  } catch {
    return "";
  }
}

function persistSlug(slug) {
  try {
    localStorage.setItem(REGION_SLUG_STORAGE_KEY, slug);
  } catch {
    // Region selection still works for the current session.
  }
}

export function RegionProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [regions, setRegions] = useState([]);
  const [region, setRegion] = useState(null);
  const [regionSlug, setRegionSlug] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const routeSlug = getSlugFromPath(location.pathname);

  useEffect(() => {
    let cancelled = false;

    async function fetchRegions() {
      setLoading(true);
      setError(null);
      try {
        const response = await regionService.list({ limit: 50 });
        if (cancelled) return;
        setRegions(Array.isArray(response?.regions) ? response.regions : []);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Unable to load regions.");
        setRegions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRegions();
    return () => {
      cancelled = true;
    };
  }, []);

  const applySlug = useCallback(
    async (slug, options = {}) => {
      const normalizedSlug = normalizeRegionSlug(slug) || DEFAULT_REGION_SLUG;

      if (!isKnownRegionSlug(normalizedSlug)) {
        setRegion(null);
        setRegionSlug(normalizedSlug);
        setError(`Region "${normalizedSlug}" is not supported.`);
        return null;
      }

      const nextRegion = resolveRegionBySlug(normalizedSlug, regions);
      if (!nextRegion) {
        setRegion(null);
        setRegionSlug(normalizedSlug);
        setError(`Region "${normalizedSlug}" is not configured in Medusa.`);
        return null;
      }

      setRegion(nextRegion);
      setRegionSlug(normalizedSlug);
      setError(null);
      persistSlug(normalizedSlug);
      setResolvedRegionContext(nextRegion);

      if (options.navigateToShop) {
        const search = options.preserveSearch === false ? "" : location.search;
        navigate(`/shop/${normalizedSlug}${search}`, { replace: Boolean(options.replace) });
      }

      return nextRegion;
    },
    [location.search, navigate, regions]
  );

  useEffect(() => {
    if (loading) return;

    const storedSlug = readStoredSlug();
    const selectedSlug =
      routeSlug ||
      (isKnownRegionSlug(storedSlug) ? storedSlug : DEFAULT_REGION_SLUG);

    applySlug(selectedSlug);
  }, [applySlug, loading, regions, routeSlug]);

  const setRegionBySlug = useCallback(
    async (slug) => applySlug(slug, { navigateToShop: true }),
    [applySlug]
  );

  const value = useMemo(
    () => ({
      regions,
      region,
      regionSlug,
      currencyCode: REGION_SLUG_CONFIG[regionSlug]?.currencyCode || region?.currency_code || null,
      countryCode: REGION_SLUG_CONFIG[regionSlug]?.countryCode || null,
      loading,
      error,
      setRegionBySlug,
      defaultRegionSlug: DEFAULT_REGION_SLUG,
    }),
    [regions, region, regionSlug, loading, error, setRegionBySlug]
  );

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  const context = useContext(RegionContext);
  if (!context) {
    throw new Error("useRegion must be used inside RegionProvider");
  }
  return context;
}
