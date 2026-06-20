import { useCallback, useEffect, useMemo, useState } from "react";
import { listCheckoutOrders } from "../../services/checkoutApi";

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

export default function AdminDashboard() {
  const envAdminKey = import.meta.env.VITE_ADMIN_API_KEY || "";
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const opts = envAdminKey ? { adminKey: envAdminKey } : {};
      const data = await listCheckoutOrders(opts);
      const list = data?.orders;
      setOrders(Array.isArray(list) ? list : []);
    } catch (e) {
      const msg = e?.message || "Could not load orders";
      if (e?.status === 401) {
        setError(
          `${msg} Set payment-server ADMIN_API_KEY and the same value as VITE_ADMIN_API_KEY in frontend/.env, then restart both servers.`
        );
      } else {
        setError(msg);
      }
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [envAdminKey]);

  useEffect(() => {
    const tid = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(tid);
  }, [load]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    let todayCount = 0;
    let revenue = 0;
    for (const o of orders) {
      const d = o.createdAt ? new Date(o.createdAt).toDateString() : "";
      if (d === today) todayCount += 1;
      if (o.status === "paid" || o.status === "confirmed") {
        revenue += Number(o.total) || 0;
      }
    }
    return {
      todayCount,
      revenue,
      totalOrders: orders.length,
    };
  }, [orders]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-gray-900">Orders &amp; checkout</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Data from <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">payment-server</code> (
            <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">/v1/orders</code>
            ). If the server has <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">ADMIN_API_KEY</code> set,
            add the same value as <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">VITE_ADMIN_API_KEY</code>{" "}
            for this page (dev only).
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Orders (loaded)", value: stats.totalOrders },
          { label: "Placed today", value: stats.todayCount },
          { label: "Recorded revenue", value: formatMoney(stats.revenue) },
          { label: "Admin key", value: envAdminKey ? "Set" : "Optional" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-stone-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 bg-stone-50/80 px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">All orders</h2>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <p className="p-8 text-center text-sm text-gray-500">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">No orders yet.</p>
          ) : (
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50/90 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6">ID</th>
                  <th className="px-4 py-3 sm:px-6">When</th>
                  <th className="px-4 py-3 sm:px-6">Customer</th>
                  <th className="px-4 py-3 sm:px-6">Items</th>
                  <th className="px-4 py-3 sm:px-6">Pay</th>
                  <th className="px-4 py-3 sm:px-6">Status</th>
                  <th className="px-4 py-3 text-right sm:px-6">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-organic-peach/10">
                    <td className="max-w-[140px] truncate px-4 py-3 font-mono text-xs text-gray-800 sm:px-6">
                      {o.id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600 sm:px-6">
                      {o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-gray-800 sm:px-6">
                      {o.customer?.name || "—"}
                      <span className="mt-0.5 block truncate text-xs text-gray-500">{o.customer?.phone}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 sm:px-6">{o.items?.length ?? 0}</td>
                    <td className="px-4 py-3 capitalize text-gray-700 sm:px-6">{o.fulfillment}</td>
                    <td className="px-4 py-3 sm:px-6">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-800">
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 sm:px-6">
                      {formatMoney(o.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
