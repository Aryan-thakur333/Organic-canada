import { useMemo, useState, useEffect } from "react";
import Navbar from "../Navbar";
import Footer from "../Footer";
import MobileNav from "../MobileNav";
import OrganicPromoBar from "../organic/OrganicPromoBar";
import OrganicProductCard from "../organic/OrganicProductCard";
import QuickViewModal from "../QuickViewModal";
import { ORGANIC_PRODUCTS } from "../../data/organicProducts";
import { getProducts } from "../../services/api";
import { isMedusaConfigured } from "../../config/publicEnv";
import LoadingSpinner from "../common/LoadingSpinner";

function priceAmount(p) {
  const v = p?.variants?.[0];
  if (v?.calculated_price?.calculated_amount != null) {
    return Number(v.calculated_price.calculated_amount) / 100;
  }
  return p?.variants?.[0]?.prices?.[0]?.amount != null ? p.variants[0].prices[0].amount / 100 : 0;
}

export default function Listing() {
  const [sortBy, setSortBy] = useState("recommended");
  const [quickProduct, setQuickProduct] = useState(null);
  const [remoteProducts, setRemoteProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!isMedusaConfigured()) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const list = await getProducts();
        if (!cancelled) setRemoteProducts(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || "Could not load products");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceList = isMedusaConfigured() ? remoteProducts : ORGANIC_PRODUCTS;

  const sorted = useMemo(() => {
    const list = [...sourceList];
    if (sortBy === "price-asc") {
      list.sort((a, b) => priceAmount(a) - priceAmount(b));
    } else if (sortBy === "price-desc") {
      list.sort((a, b) => priceAmount(b) - priceAmount(a));
    } else if (sortBy === "rating") {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === "name") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [sortBy, sourceList]);

  return (
    <div className="min-h-screen bg-organic-headerBg">
      <OrganicPromoBar />
      <Navbar />
      <main className="border-t border-stone-200/60 bg-organic-peach px-4 pb-24 pt-6 md:pb-10 md:pt-8">
        <div className="container">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="font-display text-2xl font-bold tracking-tight text-gray-950 md:text-3xl">
              All products
            </h1>
            <label className="sr-only" htmlFor="sort-products">
              Sort products
            </label>
            <div className="relative shrink-0">
              <select
                id="sort-products"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none rounded-2xl border-2 border-stone-200 bg-white py-3 pl-4 pr-10 text-sm font-semibold text-gray-900 shadow-sm outline-none transition focus:border-organic-primary/40 focus:ring-2 focus:ring-organic-primary/25"
              >
                <option value="recommended">Sort by: Recommended</option>
                <option value="price-asc">Sort by: Price — Low to high</option>
                <option value="price-desc">Sort by: Price — High to low</option>
                <option value="rating">Sort by: Rating</option>
                <option value="name">Sort by: Name A–Z</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                ▾
              </span>
            </div>
          </div>

          {isMedusaConfigured() && loadError ? (
            <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {loadError}
            </p>
          ) : null}

          {loading ? (
            <LoadingSpinner fullScreen={false} label="Loading catalog…" />
          ) : sorted.length === 0 ? (
            <p className="rounded-2xl border border-stone-200 bg-white p-6 text-gray-600">
              No products found. Seed your Medusa database or check API keys and region configuration.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {sorted.map((item) => (
                <OrganicProductCard
                  key={item.id}
                  item={item}
                  onQuickView={setQuickProduct}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
      <MobileNav />
      <QuickViewModal
        product={quickProduct}
        onClose={() => setQuickProduct(null)}
      />
    </div>
  );
}
