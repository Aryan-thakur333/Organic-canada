import { useEffect, useMemo, useState } from "react";
import { filterProducts, getProducts } from "../../services/api";
import useDebounce from "../../hooks/useDebounce";
import LoadingSpinner from "../common/LoadingSpinner";

export default function Search() {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 400);

  useEffect(() => {
    let mounted = true;

    async function runSearch() {
      setIsLoading(true);
      try {
        const data = debouncedQuery
          ? await filterProducts({ query: debouncedQuery })
          : await getProducts();
        if (mounted) setProducts(data);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    runSearch();
    return () => {
      mounted = false;
    };
  }, [debouncedQuery]);

  const results = useMemo(() => {
    return products.map((item) => ({
      id: item.id,
      name: item.title,
      price: (item.variants?.[0]?.prices?.[0]?.amount || 0) / 100,
    }));
  }, [products]);

  return (
    <section className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900">Search</h1>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search dishes or restaurants..."
        className="mt-5 w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-red-500"
      />

      {isLoading ? (
        <div className="mt-6">
          <LoadingSpinner label="Searching products..." />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {results.map((item) => (
            <li key={item.id} className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-gray-600">${item.price.toFixed(2)}</p>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="rounded-lg border border-gray-200 px-4 py-3 text-gray-600">
              No products found.
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
