import { useState } from "react";
import POSShell from "../../components/pos/POSShell";
import { posApi } from "../../services/posApi";

export default function POSCustomers() {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);

  const search = async (value) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setCustomers([]);
      return;
    }
    const data = await posApi.searchCustomers(value);
    setCustomers(data?.customers || []);
  };

  return (
    <POSShell>
      <div className="p-4 lg:p-6">
        <h1 className="text-2xl font-black">Customers</h1>
        <input value={query} onChange={(event) => search(event.target.value)} placeholder="Search email, phone, or name" className="mt-4 h-12 w-full max-w-xl rounded border border-zinc-300 px-3 font-semibold outline-none focus:border-emerald-700" />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => (
            <div key={customer.id} className="rounded border border-zinc-200 bg-white p-4">
              <p className="font-black">{customer.email}</p>
              <p className="text-sm text-zinc-500">{[customer.first_name, customer.last_name, customer.phone].filter(Boolean).join(" ")}</p>
            </div>
          ))}
        </div>
      </div>
    </POSShell>
  );
}
