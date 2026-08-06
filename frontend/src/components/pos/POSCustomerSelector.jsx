import { useState } from "react";
import { Search, UserRound, X } from "lucide-react";
import { posApi } from "../../services/posApi";

export default function POSCustomerSelector({ customer, onSelect, registerId }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const search = async (value) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    const data = await posApi.searchCustomers(value, registerId);
    setResults(data?.customers || []);
  };

  return (
    <section className="rounded border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-black uppercase text-zinc-600">Customer</h2>
        {customer ? (
          <button onClick={() => onSelect(null)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100" title="Use walk-in customer">
            <X size={16} />
          </button>
        ) : null}
      </div>
      {customer ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
          <p className="font-black text-emerald-950">{customer.first_name || customer.last_name ? `${customer.first_name || ""} ${customer.last_name || ""}` : customer.email}</p>
          <p className="text-sm text-emerald-800">{customer.email}</p>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={17} />
            <input value={query} onChange={(event) => search(event.target.value)} placeholder="Walk-in or search customer" className="h-11 w-full rounded border border-zinc-300 pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-700" />
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto">
            {results.map((result) => (
              <button key={result.id} onClick={() => onSelect(result)} className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-zinc-100">
                <UserRound size={16} className="text-zinc-400" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{result.email}</span>
                  <span className="block truncate text-xs text-zinc-500">{[result.first_name, result.last_name, result.phone].filter(Boolean).join(" ")}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
