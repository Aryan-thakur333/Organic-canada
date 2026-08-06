import { useEffect, useState } from "react";
import { PackageSearch, Plus } from "lucide-react";
import { posApi } from "../../services/posApi";

const formatMoney = (amount, currency = "cad") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(Number(amount || 0) / 100);

export default function POSProductSearch({ onAdd, registerId }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setProducts([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await posApi.searchProducts(q, registerId);
        setProducts(result?.products || []);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query, registerId]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="relative">
        <PackageSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search product title, SKU, barcode"
          className="h-14 w-full rounded border border-zinc-300 bg-white pl-11 pr-3 text-base font-semibold outline-none focus:border-emerald-700"
        />
      </div>

      <div className="mt-4 grid gap-3 overflow-y-auto pb-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <button
            key={product.variant_id}
            onClick={() => onAdd(product)}
            className="flex min-h-[132px] gap-3 rounded border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-700 hover:shadow"
          >
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded bg-zinc-100">
              {product.thumbnail ? <img src={product.thumbnail} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-black text-zinc-950">{product.product_title}</p>
              <p className="mt-1 truncate text-xs font-semibold text-zinc-500">{product.variant_title || product.sku || "Default"}</p>
              <p className="mt-2 text-base font-black text-emerald-700">{formatMoney(product.price.amount_minor, product.price.currency_code)}</p>
              <p className="text-xs text-zinc-500">Stock: {product.inventory.available_quantity}</p>
            </div>
            <Plus className="mt-1 text-emerald-700" size={20} />
          </button>
        ))}
        {!loading && query.trim().length >= 2 && products.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-300 bg-white p-6 text-sm font-semibold text-zinc-500">No products found.</div>
        ) : null}
        {loading ? <div className="rounded border border-zinc-200 bg-white p-6 text-sm font-semibold text-zinc-500">Searching...</div> : null}
      </div>
    </section>
  );
}
